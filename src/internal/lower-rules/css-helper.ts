import { compile } from "stylis";

import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { getMemberPathFromIdentifier } from "../jscodeshift-utils.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import { parseSelector } from "../selectors.js";
import { wrapExprWithStaticParts } from "./interpolations.js";

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
}): {
  isCssHelperTaggedTemplate: (expr: any) => expr is { quasi: any };
  resolveCssHelperTemplate: (
    template: any,
    paramName: string | null,
    _ownerName: string,
  ) => {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
  } | null;
} {
  const { importMap, filePath, resolveValue, parseExpr, resolverImports, cssValueToJs } = args;

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
    for (const imp of res.imports ?? []) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    const exprAst = parseExpr(res.expr);
    return exprAst ? { ast: exprAst, exprString: res.expr } : null;
  };

  const resolveCssHelperTemplate = (
    template: any,
    paramName: string | null,
    _ownerName: string,
  ): {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
  } | null => {
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
        return null;
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
            return null;
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
          return null;
        }
      }

      for (const d of rule.declarations) {
        if (!d.property) {
          return null;
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
          return null;
        }

        const parts = d.value.parts ?? [];

        // Find slots in the value parts
        const slotParts = parts.filter((p: { kind: string }) => p.kind === "slot");
        if (slotParts.length !== 1) {
          // Only support single-slot values
          return null;
        }
        const slotPart = slotParts[0] as { kind: "slot"; slotId: number };
        const slotId = slotPart.slotId;
        const expr = slotExprById.get(slotId);
        if (!expr) {
          return null;
        }
        const resolved = resolveHelperExprToAst(expr as any, paramName);
        if (resolved) {
          // Check if there are static parts around the slot (e.g., box-shadow: 0 0 0 1px ${theme})
          const hasStaticParts = parts.length > 1;
          if (hasStaticParts) {
            // Extract prefix and suffix static parts
            let prefix = "";
            let suffix = "";
            let foundSlot = false;
            for (const part of parts) {
              if (part.kind === "slot") {
                foundSlot = true;
                continue;
              }
              if (part.kind === "static") {
                if (foundSlot) {
                  suffix += part.value ?? "";
                } else {
                  prefix += part.value ?? "";
                }
              }
            }
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
            return null;
          } else {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              (target as any)[mapped.prop] = resolved.ast as any;
            }
            continue;
          }
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
