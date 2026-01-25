import { compile } from "stylis";

import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { getMemberPathFromIdentifier } from "../jscodeshift-utils.js";
import type { WarningLog, WarningType } from "../logger.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import { addResolverImports } from "../resolver-imports.js";
import { parseSelector } from "../selectors.js";
import { extractStaticParts, wrapExprWithStaticParts } from "./interpolations.js";

type ImportMapEntry = {
  importedName: string;
  source: ImportSource;
};

export function createCssHelperResolver(args: {
  importMap: Map<string, ImportMapEntry>;
  filePath: string;
  resolveValue: Adapter["resolveValue"];
  parseExpr: (exprSource: string) => any;
  resolverImports: Map<string, ImportSpec>;
  cssValueToJs: (value: unknown, important?: boolean, propName?: string) => unknown;
  warnings: WarningLog[];
}): {
  isCssHelperTaggedTemplate: (expr: any) => expr is { quasi: any };
  resolveCssHelperTemplate: (
    template: any,
    paramName: string | null,
    ownerName: string,
    loc: { line: number; column: number } | null | undefined,
  ) => {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
  } | null;
} {
  const { importMap, filePath, resolveValue, parseExpr, resolverImports, cssValueToJs, warnings } =
    args;

  const isCssHelperTaggedTemplate = (expr: any): expr is { quasi: any } => {
    if (!expr || expr.type !== "TaggedTemplateExpression") {
      return false;
    }
    if (expr.tag?.type !== "Identifier") {
      return false;
    }
    const localName = expr.tag.name;
    const imp = importMap.get(localName);
    return (
      !!imp &&
      imp.importedName === "css" &&
      imp.source?.kind === "specifier" &&
      imp.source.value === "styled-components"
    );
  };

  const resolveHelperExprToAst = (
    expr: any,
    paramName: string | null,
  ): { ast: any; exprString: string } | null => {
    if (!expr || typeof expr !== "object") {
      return null;
    }
    if (
      expr.type === "StringLiteral" ||
      expr.type === "NumericLiteral" ||
      expr.type === "Literal"
    ) {
      return { ast: expr, exprString: JSON.stringify(expr.value) };
    }
    const path =
      paramName && (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression")
        ? getMemberPathFromIdentifier(expr as any, paramName)
        : null;
    if (!path || path[0] !== "theme") {
      return null;
    }
    const themePath = path.slice(1).join(".");
    const res = resolveValue({
      kind: "theme",
      path: themePath,
      filePath,
    });
    if (!res) {
      return null;
    }
    addResolverImports(resolverImports, res.imports);
    const exprAst = parseExpr(res.expr);
    return exprAst ? { ast: exprAst, exprString: res.expr } : null;
  };

  const resolveCssHelperTemplate = (
    template: any,
    paramName: string | null,
    ownerName: string,
    loc: { line: number; column: number } | null | undefined,
  ): {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
  } | null => {
    const bail = (type: WarningType, context?: { property?: string }): null => {
      warnings.push({
        severity: "warning",
        type,
        loc,
        context: { localName: ownerName, ...context },
      });
      return null;
    };

    const parsed = parseStyledTemplateLiteral(template);
    const rawCss = parsed.rawCss;
    const wrappedRawCss = `& { ${rawCss} }`;
    const stylisAst = compile(wrappedRawCss);
    const rules = normalizeStylisAstToIR(stylisAst as any, parsed.slots, {
      rawCss: wrappedRawCss,
    });
    const slotExprById = new Map(parsed.slots.map((s) => [s.index, s.expression]));

    const out: Record<string, unknown> = {};
    const dynamicProps: Array<{ jsxProp: string; stylexProp: string }> = [];
    const dynamicPropKeys = new Set<string>();

    const normalizePseudoElement = (pseudo: string | null): string | null => {
      if (!pseudo) {
        return null;
      }
      if (pseudo === ":before" || pseudo === ":after") {
        return `::${pseudo.slice(1)}`;
      }
      return pseudo.startsWith("::") ? pseudo : null;
    };

    for (const rule of rules) {
      if (rule.atRuleStack.length > 0) {
        return bail("Conditional `css` block: @-rules (e.g., @media, @supports) are not supported");
      }
      const selector = (rule.selector ?? "").trim();
      const allowDynamicValues = selector === "&";
      let target = out;
      if (selector !== "&") {
        const parsed = parseSelector(selector);

        if (parsed.kind === "pseudoElement") {
          const normalizedPseudoElement = normalizePseudoElement(parsed.element);
          if (normalizedPseudoElement) {
            const nested = (out[normalizedPseudoElement] as any) ?? {};
            out[normalizedPseudoElement] = nested;
            target = nested;
          } else {
            return bail("Conditional `css` block: unsupported selector");
          }
        } else if (parsed.kind === "pseudo" && parsed.pseudos.length === 1) {
          const simplePseudo = parsed.pseudos[0]!;
          // Handle :before/:after as pseudo-elements
          const normalizedPseudoElement = normalizePseudoElement(
            simplePseudo === ":before" || simplePseudo === ":after" ? simplePseudo : null,
          );
          if (normalizedPseudoElement) {
            const nested = (out[normalizedPseudoElement] as any) ?? {};
            out[normalizedPseudoElement] = nested;
            target = nested;
          } else {
            const nested = (out[simplePseudo] as any) ?? {};
            out[simplePseudo] = nested;
            target = nested;
          }
        } else {
          return bail("Conditional `css` block: unsupported selector");
        }
      }

      for (const d of rule.declarations) {
        if (!d.property) {
          return bail("Conditional `css` block: missing CSS property name");
        }
        if (d.value.kind === "static") {
          for (const mapped of cssDeclarationToStylexDeclarations(d)) {
            let value = cssValueToJs(mapped.value, d.important, mapped.prop);
            if (mapped.prop === "content" && typeof value === "string") {
              const m = value.match(/^['"]([\s\S]*)['"]$/);
              if (m) {
                value = `"${m[1]}"`;
              } else if (!value.startsWith('"') && !value.endsWith('"')) {
                value = `"${value}"`;
              }
            }
            (target as any)[mapped.prop] = value as any;
          }
          continue;
        }

        if (d.important) {
          return bail("Conditional `css` block: !important is not supported in StyleX", {
            property: d.property,
          });
        }

        const parts = d.value.parts ?? [];

        // Find slots in the value parts
        const slotParts = parts.filter((p: { kind: string }) => p.kind === "slot");
        if (slotParts.length !== 1) {
          // Only support single-slot values
          return bail(
            "Conditional `css` block: multiple interpolation slots in a single property value",
            { property: d.property },
          );
        }

        // Check if there are static parts around the slot (e.g., box-shadow: 0 0 0 1px ${theme})
        const hasStaticParts = parts.length > 1;

        const slotPart = slotParts[0] as { kind: "slot"; slotId: number };
        const slotId = slotPart.slotId;
        const expr = slotExprById.get(slotId);
        if (!expr) {
          return bail("Conditional `css` block: missing interpolation expression", {
            property: d.property,
          });
        }
        const resolved = resolveHelperExprToAst(expr as any, paramName);
        if (resolved) {
          if (hasStaticParts) {
            const { prefix, suffix } = extractStaticParts(d.value);
            // Create a template literal string using the shared helper (same logic as top-level)
            const wrappedExpr = wrapExprWithStaticParts(resolved.exprString, prefix, suffix);
            const templateAst = parseExpr(wrappedExpr);
            if (templateAst) {
              for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                (target as any)[mapped.prop] = templateAst as any;
              }
              continue;
            }
            // Fall through if parsing failed
            return bail("Conditional `css` block: failed to parse expression", {
              property: d.property,
            });
          } else {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              (target as any)[mapped.prop] = resolved.ast as any;
            }
            continue;
          }
        }

        // Mixed static/dynamic values with non-theme expressions cannot be safely transformed
        // (e.g., border: 1px solid ${props.color} would lose the "1px solid " prefix)
        if (hasStaticParts) {
          return bail(
            "Conditional `css` block: mixed static/dynamic values with non-theme expressions cannot be safely transformed",
            { property: d.property },
          );
        }

        const propPath =
          paramName && (expr as any)?.type
            ? getMemberPathFromIdentifier(expr as any, paramName)
            : null;
        if (!allowDynamicValues || !propPath || propPath.length !== 1) {
          return null;
        }
        const jsxProp = propPath[0]!;
        if (jsxProp === "theme") {
          return null;
        }
        for (const mapped of cssDeclarationToStylexDeclarations(d)) {
          const key = `${jsxProp}:${mapped.prop}`;
          if (!dynamicPropKeys.has(key)) {
            dynamicPropKeys.add(key);
            dynamicProps.push({ jsxProp, stylexProp: mapped.prop });
          }
        }
      }
    }

    return { style: out, dynamicProps };
  };

  return { isCssHelperTaggedTemplate, resolveCssHelperTemplate };
}
