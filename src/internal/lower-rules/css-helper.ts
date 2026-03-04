/**
 * Parses css`` helper templates into IR and resolves helper styles.
 * Core concepts: Stylis parsing, selector normalization, and dynamic slots.
 */
import { compile } from "stylis";

import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import {
  extractRootAndPath,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isAstNode,
} from "../utilities/jscodeshift-utils.js";
import type { WarningLog, WarningType } from "../logger.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import { parseSelector } from "../selectors.js";
import { wrapExprWithStaticParts } from "./interpolations.js";
import { cssValueToJs } from "../transform/helpers.js";
import {
  expandInterpolatedAnimationShorthand,
  expandStaticAnimationShorthand,
} from "../keyframes.js";
import {
  findSupportedAtRule,
  resolveMediaAtRulePlaceholders,
  type ResolvedMedia,
} from "./utils.js";

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
  resolveSelector?: Adapter["resolveSelector"];
  parseExpr: (exprSource: string) => any;
  resolverImports: Map<string, ImportSpec>;
  warnings: WarningLog[];
  keyframesNames?: Set<string>;
  inlineKeyframeNameMap?: Map<string, string>;
  j?: import("jscodeshift").JSCodeshift;
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
    // Handle identifiers and member expressions (local constants or imports)
    const info = extractRootAndPath(branch);
    if (info) {
      const imp = importMap.get(info.rootName);
      if (imp) {
        const res = resolveValue({
          kind: "importedValue",
          importedName: imp.importedName,
          source: imp.source,
          ...(info.path.length > 0 ? { path: info.path.join(".") } : {}),
          filePath,
          loc: getNodeLocStart(branch) ?? undefined,
        });
        if (!res) {
          return null;
        }
        for (const impSpec of res.imports ?? []) {
          resolverImports.set(JSON.stringify(impSpec), impSpec);
        }
        const exprAst = parseExpr(res.expr);
        return exprAst ? { ast: exprAst, exprString: res.expr } : null;
      }
      // Local identifier (not an import) - use as-is
      if (branch.type === "Identifier") {
        return { ast: branch, exprString: info.rootName };
      }
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
    const bail = (
      type: WarningType,
      context?: { property?: string },
      exprLoc?: { line: number; column: number } | null,
    ): null => {
      warnings.push({
        severity: "warning",
        type,
        loc: exprLoc ?? loc,
        context,
      });
      return null;
    };

    const { rules, slotExprById } = parseCssTemplateToRules(template);

    const out: Record<string, unknown> = {};
    const dynamicProps: Array<{ jsxProp: string; stylexProp: string }> = [];
    const dynamicPropKeys = new Set<string>();
    const conditionalVariants: ConditionalVariant[] = [];

    const lookupImport = (localName: string) => importMap.get(localName) ?? null;

    for (const rule of rules) {
      const rawMedia = findSupportedAtRule(rule.atRuleStack);
      // Only support @media and @container at-rules; bail on others (@supports, @keyframes, etc.)
      if (rule.atRuleStack.length > 0 && !rawMedia) {
        return bail("Conditional `css` block: @-rules (e.g., @media, @supports) are not supported");
      }

      // Resolve __SC_EXPR_N__ placeholders inside the media query
      let media: string | undefined = rawMedia;
      let computedMediaKey: ResolvedMedia | null = null;
      if (rawMedia) {
        const resolved = resolveMediaAtRulePlaceholders(
          rawMedia,
          (slotId) => slotExprById.get(slotId),
          {
            lookupImport,
            resolveValue,
            resolveSelector: args.resolveSelector,
            parseExpr,
            filePath,
            resolverImports,
          },
        );
        if (resolved === null) {
          return bail(
            "Conditional `css` block: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)",
          );
        }
        if (resolved.kind === "static") {
          media = resolved.value;
        } else {
          computedMediaKey = resolved;
          media = undefined;
        }
      }

      const selector = (rule.selector ?? "").trim();
      const allowDynamicValues = selector === "&";
      let target = out;
      // Track pseudo-class context for property-first format (e.g., ":hover")
      // Pseudo-elements (::before, ::after) use selector-first format in StyleX,
      // so they use nested target objects instead.
      let currentPseudoClass: string | null = null;
      // For comma-separated pseudo-elements (e.g., "&:before, &:after"),
      // declarations are duplicated into each pseudo-element's nested object.
      let pseudoElementTargets: Array<{ key: string; obj: Record<string, unknown> }> | null = null;
      if (selector !== "&") {
        const parsed = parseSelector(selector);

        if (parsed.kind === "pseudoElement") {
          const nested = (out[parsed.element] as Record<string, unknown>) ?? {};
          out[parsed.element] = nested;
          target = nested;
        } else if (parsed.kind === "pseudoElements") {
          pseudoElementTargets = parsed.elements.map((el) => {
            const nested = (out[el] as Record<string, unknown>) ?? {};
            out[el] = nested;
            return { key: el, obj: nested };
          });
          // Use the first pseudo-element's target as the primary target for iteration below
          target = pseudoElementTargets[0]?.obj ?? out;
        } else if (parsed.kind === "pseudoElementWithPseudo" && parsed.pseudos.length === 1) {
          const nested = (out[parsed.element] as Record<string, unknown>) ?? {};
          out[parsed.element] = nested;
          target = nested;
          currentPseudoClass = parsed.pseudos[0]!;
        } else if (parsed.kind === "pseudo" && parsed.pseudos.length === 1) {
          const simplePseudo = parsed.pseudos[0]!;
          // Pseudo-classes (:hover, :focus, etc.) use property-first format:
          // { prop: { default: null, ":hover": value } }
          currentPseudoClass = simplePseudo;
        } else {
          return bail("Conditional `css` block: unsupported selector");
        }
      }

      // Merge a value into the appropriate nested context (pseudo-class, @media, or computed key).
      // Handles all combinations: base, pseudo-only, media-only, computed-media, pseudo+media.
      const mergeIntoContext = (
        value: unknown,
        prop: string,
        targetObj: Record<string, unknown>,
      ): unknown => {
        const existing = targetObj[prop];
        if (computedMediaKey) {
          const nested: Record<string, unknown> =
            existing &&
            typeof existing === "object" &&
            !Array.isArray(existing) &&
            !isAstNode(existing)
              ? (existing as Record<string, unknown>)
              : { default: existing ?? null };
          if (!("default" in nested)) {
            nested.default = null;
          }
          const prev = (nested.__computedKeys as Array<{ keyExpr: unknown; value: unknown }>) ?? [];
          nested.__computedKeys = [...prev, { keyExpr: computedMediaKey.keyExpr, value }];
          return nested;
        }
        if (media && currentPseudoClass) {
          // Nested pseudo + media: { ":hover": { default: null, "@media (...)": value } }
          const pseudoExisting =
            existing &&
            typeof existing === "object" &&
            !Array.isArray(existing) &&
            !isAstNode(existing)
              ? (existing as Record<string, unknown>)[currentPseudoClass]
              : undefined;
          const mediaWrapped = mergeIntoPseudoContext(value, media, pseudoExisting);
          return mergeIntoPseudoContext(mediaWrapped, currentPseudoClass, existing);
        }
        if (media) {
          return mergeIntoPseudoContext(value, media, existing);
        }
        return mergeIntoPseudoContext(value, currentPseudoClass, existing);
      };

      // Snapshot existing keys so we only duplicate NEW properties set by this rule
      // (not stale state accumulated from earlier rules).
      const preRuleKeys =
        pseudoElementTargets && pseudoElementTargets.length > 1
          ? new Set(Object.keys(pseudoElementTargets[0]!.obj))
          : null;

      for (const d of rule.declarations) {
        if (!d.property) {
          return bail("Conditional `css` block: missing CSS property name");
        }
        if (d.value.kind === "static") {
          // Expand animation shorthand referencing inline @keyframes
          if (
            d.property === "animation" &&
            args.keyframesNames &&
            args.keyframesNames.size > 0 &&
            args.j
          ) {
            const expanded: Record<string, unknown> = {};
            if (
              expandStaticAnimationShorthand(
                d.valueRaw,
                args.keyframesNames,
                args.j,
                expanded,
                args.inlineKeyframeNameMap,
              )
            ) {
              for (const [prop, value] of Object.entries(expanded)) {
                (target as any)[prop] = mergeIntoContext(value, prop, target as any) as any;
              }
              continue;
            }
          }
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
            (target as any)[mapped.prop] = mergeIntoContext(
              value,
              mapped.prop,
              target as any,
            ) as any;
          }
          continue;
        }

        if (d.important) {
          return bail("Conditional `css` block: !important is not supported in StyleX", {
            property: d.property,
          });
        }

        // Expand interpolated animation shorthand referencing keyframes identifiers
        if (
          d.property === "animation" &&
          args.keyframesNames &&
          args.keyframesNames.size > 0 &&
          args.j
        ) {
          const expanded = expandInterpolatedAnimationShorthand({
            valueRaw: d.valueRaw,
            slotExprById,
            keyframesNames: args.keyframesNames,
            j: args.j,
            inlineKeyframeNameMap: args.inlineKeyframeNameMap,
          });
          if (expanded) {
            for (const [prop, value] of Object.entries(expanded)) {
              (target as any)[prop] = mergeIntoContext(value, prop, target as any) as any;
            }
            continue;
          }
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
        const exprLoc = (expr as { loc?: { start?: { line: number; column: number } } }).loc?.start;
        if (hasCallExpressionInExpr(expr)) {
          return bail(
            "Conditional `css` block: failed to parse expression",
            { property: d.property },
            exprLoc,
          );
        }
        const resolved = resolveHelperExprToAst(expr as any, paramName);
        if (!resolved && hasThemeAccessInExpr(expr, paramName)) {
          return bail(
            "Conditional `css` block: failed to parse expression",
            { property: d.property },
            exprLoc,
          );
        }
        if (resolved) {
          if (hasStaticParts) {
            const { prefix, suffix } = extractPrefixSuffix(parts);
            // Create a template literal string using the shared helper (same logic as top-level)
            const wrappedExpr = wrapExprWithStaticParts(resolved.exprString, prefix, suffix);
            const templateAst = parseExpr(wrappedExpr);
            if (templateAst) {
              for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                (target as any)[mapped.prop] = mergeIntoContext(
                  templateAst,
                  mapped.prop,
                  target as any,
                ) as any;
              }
              continue;
            }
            // Fall through if parsing failed
            return bail(
              "Conditional `css` block: failed to parse expression",
              { property: d.property },
              exprLoc,
            );
          } else {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              (target as any)[mapped.prop] = mergeIntoContext(
                resolved.ast,
                mapped.prop,
                target as any,
              ) as any;
            }
            continue;
          }
        }

        // Handle ConditionalExpression with static parts: ${prop ? val1 : val2}px
        // We can create variants for each branch, wrapping in pseudo context when needed
        if (hasStaticParts && expr && (expr as any).type === "ConditionalExpression") {
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
            const { prefix, suffix } = extractPrefixSuffix(parts);

            // Create AST for false branch (alternate) as base value
            const altWrappedExpr = wrapExprWithStaticParts(altResolved.exprString, prefix, suffix);
            const altAst = parseExpr(altWrappedExpr);

            // Create AST for true branch (consequent) as variant value
            const consWrappedExpr = wrapExprWithStaticParts(
              consResolved.exprString,
              prefix,
              suffix,
            );
            const consAst = parseExpr(consWrappedExpr);

            if (altAst && consAst) {
              // Add false branch to base style (with pseudo/media wrapping)
              for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                (target as any)[mapped.prop] = mergeIntoContext(
                  altAst,
                  mapped.prop,
                  target as any,
                ) as any;
              }

              // Build variant style for true branch (with pseudo/media wrapping)
              const variantStyle: Record<string, unknown> = {};
              for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                variantStyle[mapped.prop] = mergeIntoContext(consAst, mapped.prop, target as any);
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
          return bail(
            "Conditional `css` block: dynamic interpolation could not be resolved to a single component prop",
            { property: d.property },
            exprLoc,
          );
        }
        const jsxProp = propPath[0]!;
        if (jsxProp === "theme") {
          return bail(
            "Conditional `css` block: failed to parse expression",
            { property: d.property },
            exprLoc,
          );
        }
        for (const mapped of cssDeclarationToStylexDeclarations(d)) {
          const key = `${jsxProp}:${mapped.prop}`;
          if (!dynamicPropKeys.has(key)) {
            dynamicPropKeys.add(key);
            dynamicProps.push({ jsxProp, stylexProp: mapped.prop });
          }
        }
      }

      // For comma-separated pseudo-elements, duplicate only the declarations
      // added by THIS rule (not stale state from earlier rules) to remaining targets.
      if (pseudoElementTargets && pseudoElementTargets.length > 1 && preRuleKeys) {
        const source = pseudoElementTargets[0]!.obj;
        for (const key of Object.keys(source)) {
          if (!preRuleKeys.has(key)) {
            for (let i = 1; i < pseudoElementTargets.length; i++) {
              pseudoElementTargets[i]!.obj[key] = source[key];
            }
          }
        }
      }
    }

    return { style: out, dynamicProps, conditionalVariants };
  };

  return { isCssHelperTaggedTemplate, resolveCssHelperTemplate };
}

// ---------------------------------------------------------------------------
// Non-exported helpers
// ---------------------------------------------------------------------------

/**
 * Merges a value into a pseudo-class context map for StyleX property-first format.
 *
 * When `pseudoClass` is non-null:
 * - If `existing` is already a pseudo map (plain object, not an AST node),
 *   adds/overwrites the pseudo entry
 * - If `existing` is a scalar or AST node, promotes it to `default` and adds the pseudo entry
 * - Otherwise creates `{ default: null, [pseudoClass]: value }`
 *
 * When `pseudoClass` is null (root selector), returns the value unchanged.
 */
function mergeIntoPseudoContext(
  value: unknown,
  pseudoClass: string | null,
  existing: unknown,
): unknown {
  if (!pseudoClass) {
    return value;
  }
  // Plain objects (not AST nodes, not arrays) are existing pseudo maps — extend them
  if (
    existing &&
    typeof existing === "object" &&
    !Array.isArray(existing) &&
    !isAstNode(existing)
  ) {
    return { ...(existing as Record<string, unknown>), [pseudoClass]: value };
  }
  // Scalar base value, AST node, or no existing value — create a new pseudo map
  const defaultVal = existing !== undefined ? existing : null;
  return { default: defaultVal, [pseudoClass]: value };
}
