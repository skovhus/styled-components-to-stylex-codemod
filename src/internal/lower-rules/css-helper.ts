import { compile } from "stylis";

import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { getMemberPathFromIdentifier } from "../jscodeshift-utils.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import { parseSelector } from "../selectors.js";

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
  ) => Record<string, unknown> | null;
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

  const resolveHelperExprToAst = (expr: any, paramName: string | null): any => {
    if (!expr || typeof expr !== "object") {
      return null;
    }
    if (
      expr.type === "StringLiteral" ||
      expr.type === "NumericLiteral" ||
      expr.type === "Literal"
    ) {
      return expr;
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
    return exprAst ?? null;
  };

  const resolveCssHelperTemplate = (
    template: any,
    paramName: string | null,
    _ownerName: string,
  ): Record<string, unknown> | null => {
    const parsed = parseStyledTemplateLiteral(template);
    const rawCss = parsed.rawCss;
    const wrappedRawCss = `& { ${rawCss} }`;
    const stylisAst = compile(wrappedRawCss);
    const rules = normalizeStylisAstToIR(stylisAst as any, parsed.slots, {
      rawCss: wrappedRawCss,
    });
    const slotExprById = new Map(parsed.slots.map((s) => [s.index, s.expression]));

    const out: Record<string, unknown> = {};

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
        if (parts.length !== 1 || parts[0]?.kind !== "slot") {
          return null;
        }
        const slotId = parts[0].slotId;
        const expr = slotExprById.get(slotId);
        if (!expr) {
          return null;
        }
        const exprAst = resolveHelperExprToAst(expr as any, paramName);
        if (!exprAst) {
          return null;
        }
        for (const mapped of cssDeclarationToStylexDeclarations(d)) {
          (target as any)[mapped.prop] = exprAst as any;
        }
      }
    }

    return out;
  };

  return { isCssHelperTaggedTemplate, resolveCssHelperTemplate };
}
