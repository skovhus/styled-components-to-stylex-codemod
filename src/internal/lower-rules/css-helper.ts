import { compile } from "stylis";

import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { getMemberPathFromIdentifier, getNodeLocStart } from "../utilities/jscodeshift-utils.js";
import type { WarningLog, WarningType } from "../logger.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import { parseSelector } from "../selectors.js";
import { wrapExprWithStaticParts } from "./interpolations.js";
import { cssValueToJs } from "../transform/helpers.js";

type ImportMapEntry = {
  importedName: string;
  source: ImportSource;
};

export type ConditionalVariant = {
  when: string;
  propName: string;
  style: Record<string, unknown>;
};

type ValuePart = { kind: string; value?: string; slotId?: number };

/**
 * Parses a CSS template literal to IR rules and slot expression map.
 * This is the shared parsing logic used by both resolveCssHelperTemplate and resolveCssBranchToInlineMap.
 */
export function parseCssTemplateToRules(template: any): {
  rules: ReturnType<typeof normalizeStylisAstToIR>;
  slotExprById: Map<number, unknown>;
  rawCss: string;
} {
  const parsed = parseStyledTemplateLiteral(template);
  const rawCss = parsed.rawCss;
  const wrappedRawCss = `& { ${rawCss} }`;
  const stylisAst = compile(wrappedRawCss);
  const rules = normalizeStylisAstToIR(stylisAst, parsed.slots, { rawCss: wrappedRawCss });
  const slotExprById = new Map(parsed.slots.map((s) => [s.index, s.expression]));
  return { rules, slotExprById, rawCss };
}

/**
 * Extracts prefix and suffix static parts from a value parts array.
 * Given parts like ["static:1px", "slot", "static:solid"], returns { prefix: "1px", suffix: "solid" }
 */
function extractPrefixSuffix(parts: ValuePart[]): { prefix: string; suffix: string } {
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
  return { prefix, suffix };
}

export function createCssHelperResolver(args: {
  importMap: Map<string, ImportMapEntry>;
  filePath: string;
  resolveValue: Adapter["resolveValue"];
  parseExpr: (exprSource: string) => any;
  resolverImports: Map<string, ImportSpec>;
  warnings: WarningLog[];
}): {
  isCssHelperTaggedTemplate: (expr: any) => expr is { quasi: any };
  resolveCssHelperTemplate: (
    template: any,
    paramName: string | null,
    loc: { line: number; column: number } | null | undefined,
  ) => {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
    conditionalVariants: ConditionalVariant[];
  } | null;
} {
  const { importMap, filePath, resolveValue, parseExpr, resolverImports, warnings } = args;

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
      loc: getNodeLocStart(expr) ?? undefined,
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

  const hasThemeAccessInExpr = (expr: any, paramName: string | null): boolean => {
    if (!expr || typeof expr !== "object" || !paramName) {
      return false;
    }
    let found = false;
    const visit = (node: any): void => {
      if (!node || typeof node !== "object" || found) {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          visit(child);
        }
        return;
      }
      if (
        (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
        node.object?.type === "Identifier" &&
        node.object.name === paramName &&
        node.property?.type === "Identifier" &&
        node.property.name === "theme" &&
        node.computed === false
      ) {
        found = true;
        return;
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = node[key];
        if (child && typeof child === "object") {
          visit(child);
        }
      }
    };
    visit(expr);
    return found;
  };

  const hasCallExpressionInExpr = (expr: any): boolean => {
    if (!expr || typeof expr !== "object") {
      return false;
    }
    let found = false;
    const visit = (node: any): void => {
      if (!node || typeof node !== "object" || found) {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          visit(child);
        }
        return;
      }
      if (node.type === "CallExpression") {
        found = true;
        return;
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = node[key];
        if (child && typeof child === "object") {
          visit(child);
        }
      }
    };
    visit(expr);
    return found;
  };

  /**
   * Resolves a ternary branch expression to an AST node and string representation.
   * Supports:
   * - Numeric literals (0, 24)
   * - String literals ("value")
   * - Identifiers (local constants or resolved imports)
   */
  const resolveTernaryBranchToAst = (branch: any): { ast: any; exprString: string } | null => {
    if (!branch || typeof branch !== "object") {
      return null;
    }
    if (branch.type === "NumericLiteral") {
      return { ast: branch, exprString: String(branch.value) };
    }
    if (branch.type === "StringLiteral") {
      return { ast: branch, exprString: JSON.stringify(branch.value) };
    }
    if (branch.type === "Literal") {
      const v = branch.value;
      if (typeof v === "number") {
        return { ast: branch, exprString: String(v) };
      }
      if (typeof v === "string") {
        return { ast: branch, exprString: JSON.stringify(v) };
      }
    }
    // Handle identifiers (local constants or imports)
    if (branch.type === "Identifier" && typeof branch.name === "string") {
      const name = branch.name;
      const imp = importMap.get(name);
      if (imp) {
        // Identifier is an import - try to resolve via adapter
        const res = resolveValue({
          kind: "importedValue",
          importedName: imp.importedName,
          source: imp.source,
          filePath,
          loc: getNodeLocStart(branch) ?? undefined,
        });
        if (!res) {
          // Adapter couldn't resolve - return null to trigger bail
          return null;
        }
        // Track the import for the resolver
        for (const impSpec of res.imports ?? []) {
          resolverImports.set(JSON.stringify(impSpec), impSpec);
        }
        const exprAst = parseExpr(res.expr);
        return exprAst ? { ast: exprAst, exprString: res.expr } : null;
      }
      // Local identifier (not an import) - use as-is
      return { ast: branch, exprString: name };
    }
    return null;
  };

  /**
   * Parses a ternary test expression to extract the prop name.
   * Supports:
   * - Simple prop access: props.x
   * - Member expression: props.$collapsed
   */
  const parseTernaryTestPropName = (test: any, paramName: string | null): string | null => {
    if (!test || !paramName) {
      return null;
    }
    const propPath = getMemberPathFromIdentifier(test, paramName);
    if (propPath && propPath.length === 1) {
      const propName = propPath[0]!;
      // Don't treat theme access as a prop-based condition
      if (propName !== "theme") {
        return propName;
      }
    }
    return null;
  };

  const resolveCssHelperTemplate = (
    template: any,
    paramName: string | null,
    loc: { line: number; column: number } | null | undefined,
  ): {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
    conditionalVariants: ConditionalVariant[];
  } | null => {
    const bail = (type: WarningType, context?: { property?: string }): null => {
      warnings.push({
        severity: "warning",
        type,
        loc,
        context,
      });
      return null;
    };

    const { rules, slotExprById } = parseCssTemplateToRules(template);

    const out: Record<string, unknown> = {};
    const dynamicProps: Array<{ jsxProp: string; stylexProp: string }> = [];
    const dynamicPropKeys = new Set<string>();
    const conditionalVariants: ConditionalVariant[] = [];

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
        if (hasCallExpressionInExpr(expr)) {
          return bail("Conditional `css` block: failed to parse expression", {
            property: d.property,
          });
        }
        const resolved = resolveHelperExprToAst(expr as any, paramName);
        if (!resolved && hasThemeAccessInExpr(expr, paramName)) {
          return bail("Conditional `css` block: failed to parse expression", {
            property: d.property,
          });
        }
        if (resolved) {
          if (hasStaticParts) {
            const { prefix, suffix } = extractPrefixSuffix(parts);
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

        // Handle ConditionalExpression with static parts: ${prop ? val1 : val2}px
        // We can create variants for each branch
        // Note: only allowed at root selector level; variants inside pseudo selectors would lose nesting
        if (hasStaticParts && expr && (expr as any).type === "ConditionalExpression") {
          if (!allowDynamicValues) {
            // Bail: ternary inside pseudo selector would lose the selector nesting in the variant
            return bail(
              "Conditional `css` block: ternary expressions inside pseudo selectors are not supported",
              { property: d.property },
            );
          }
          const ternaryExpr = expr as {
            type: "ConditionalExpression";
            test: any;
            consequent: any;
            alternate: any;
          };
          const propName = parseTernaryTestPropName(ternaryExpr.test, paramName);
          if (propName) {
            const consResolved = resolveTernaryBranchToAst(ternaryExpr.consequent);
            const altResolved = resolveTernaryBranchToAst(ternaryExpr.alternate);
            // If resolution failed (e.g., unresolved import), bail with specific message
            if (!consResolved || !altResolved) {
              return bail(
                "Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)",
                { property: d.property },
              );
            }
            if (consResolved && altResolved) {
              const { prefix, suffix } = extractPrefixSuffix(parts);

              // Create AST for false branch (alternate) as base value
              const altWrappedExpr = wrapExprWithStaticParts(
                altResolved.exprString,
                prefix,
                suffix,
              );
              const altAst = parseExpr(altWrappedExpr);

              // Create AST for true branch (consequent) as variant value
              const consWrappedExpr = wrapExprWithStaticParts(
                consResolved.exprString,
                prefix,
                suffix,
              );
              const consAst = parseExpr(consWrappedExpr);

              if (altAst && consAst) {
                // Add false branch to base style
                for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                  (target as any)[mapped.prop] = altAst as any;
                }

                // Build variant style for true branch
                const variantStyle: Record<string, unknown> = {};
                for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                  variantStyle[mapped.prop] = consAst;
                }

                // Add to conditional variants
                conditionalVariants.push({
                  when: propName,
                  propName,
                  style: variantStyle,
                });

                continue;
              }
            }
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

    return { style: out, dynamicProps, conditionalVariants };
  };

  return { isCssHelperTaggedTemplate, resolveCssHelperTemplate };
}
