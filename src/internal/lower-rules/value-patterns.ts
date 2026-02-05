/**
 * Pattern handlers for specific dynamic value shapes.
 * Core concepts: adapter-resolved values and prop-driven style functions.
 */
import type { API, JSCodeshift } from "jscodeshift";
import type { Adapter, ImportSpec } from "../../adapter.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningLog } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { extractStaticParts } from "./interpolations.js";
import { buildTemplateWithStaticParts } from "./inline-styles.js";
import { ensureShouldForwardPropDrop, literalToStaticValue } from "./types.js";
import {
  getMemberPathFromIdentifier,
  getNodeLocStart,
  setIdentifierTypeAnnotation,
} from "../utilities/jscodeshift-utils.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import { cssValueToJs, toSuffixFromProp } from "../transform/helpers.js";

type StyleFnFromPropsEntry = {
  fnKey: string;
  jsxProp: string;
  condition?: "truthy" | "always";
  conditionWhen?: string;
  callArg?: ExpressionKind;
};

const makeCssPropKey = (j: JSCodeshift, prop: string): ExpressionKind => {
  if (!prop.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
    return j.literal(prop);
  }
  return j.identifier(prop);
};

const cssPropertyToIdentifier = (prop: string): string => {
  if (prop.startsWith("--")) {
    const withoutDashes = prop.slice(2);
    return withoutDashes.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  return prop;
};

const makeCssProperty = (
  j: JSCodeshift,
  cssProp: string,
  valueIdentifierName: string,
): ReturnType<typeof j.property> => {
  const key = makeCssPropKey(j, cssProp);
  const p = j.property("init", key, j.identifier(valueIdentifierName)) as ReturnType<
    typeof j.property
  > & { shorthand?: boolean };
  if (key.type === "Identifier" && key.name === valueIdentifierName) {
    p.shorthand = true;
  }
  return p;
};

type ValuePatternContext = {
  api: API;
  j: JSCodeshift;
  filePath: string;
  decl: StyledDecl;
  styleObj: Record<string, unknown>;
  variantBuckets: Map<string, Record<string, unknown>>;
  variantStyleKeys: Record<string, string>;
  styleFnFromProps: StyleFnFromPropsEntry[];
  styleFnDecls: Map<string, any>;
  warnings: WarningLog[];
  resolveValue: Adapter["resolveValue"];
  parseExpr: (exprSource: string) => ExpressionKind | null;
  resolverImports: Map<string, ImportSpec>;
  stringMappingFns: Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >;
  hasLocalThemeBinding: boolean;
  annotateParamFromJsxProp: (param: any, propName: string) => void;
  findJsxPropTsType: (propName: string) => unknown;
  markBail: () => void;
};

export const createValuePatternHandlers = (ctx: ValuePatternContext) => {
  const {
    api,
    j,
    filePath,
    decl,
    styleObj,
    variantBuckets,
    variantStyleKeys,
    styleFnFromProps,
    styleFnDecls,
    warnings,
    resolveValue,
    parseExpr,
    resolverImports,
    stringMappingFns,
    hasLocalThemeBinding,
    annotateParamFromJsxProp,
    findJsxPropTsType,
    markBail,
  } = ctx;

  const tryHandleMappedFunctionColor = (d: any): boolean => {
    // Handle: background: ${(props) => getColor(props.variant)}
    // when `getColor` is a simple conditional mapping function.
    if ((d.property ?? "").trim() !== "background") {
      return false;
    }
    if (d.value.kind !== "interpolated") {
      return false;
    }
    const slot = d.value.parts.find((p: any) => p.kind === "slot");
    if (!slot) {
      return false;
    }
    const expr = decl.templateExpressions[slot.slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return false;
    }
    const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
    if (!paramName) {
      return false;
    }
    const body = expr.body as any;
    if (!body || body.type !== "CallExpression") {
      return false;
    }
    if (body.callee?.type !== "Identifier") {
      return false;
    }
    const fnName = body.callee.name;
    const mapping = stringMappingFns.get(fnName);
    if (!mapping) {
      return false;
    }
    const arg0 = body.arguments?.[0];
    if (!arg0 || arg0.type !== "MemberExpression") {
      return false;
    }
    const path = getMemberPathFromIdentifier(arg0 as any, paramName);
    if (!path || path.length !== 1) {
      return false;
    }
    const propName = path[0]!;

    // Convert this component into a wrapper so we don't forward `variant` to DOM.
    decl.needsWrapperComponent = true;

    // Build style keys for the variant mapping.
    // Use stable keys based on the component style key.
    const baseKey = decl.styleKey.endsWith("Base") ? decl.styleKey : `${decl.styleKey}Base`;
    const primaryKey = `${decl.styleKey}Primary`;
    const secondaryKey = `${decl.styleKey}Secondary`;

    // Ensure the base style object doesn't get a static background.
    // The wrapper will apply the background via variants.
    delete styleObj.backgroundColor;

    decl.enumVariant = {
      propName,
      baseKey,
      cases: [
        {
          kind: "eq",
          whenValue: mapping.whenValue,
          styleKey: primaryKey,
          value: mapping.thenValue,
        },
        {
          kind: "neq",
          whenValue: mapping.whenValue,
          styleKey: secondaryKey,
          value: mapping.elseValue,
        },
      ],
    };

    return true;
  };

  const tryHandleLogicalOrDefault = (d: any): boolean => {
    // Handle: background: ${(p) => p.color || "#BF4F74"}
    //         padding: ${(p) => p.$padding || "16px"}
    //         transition-delay: ${(p) => p.$delay ?? 0}ms
    if (d.value.kind !== "interpolated") {
      return false;
    }
    if (!d.property) {
      return false;
    }
    const parts = d.value.parts ?? [];
    const slot = parts.find((p: any) => p.kind === "slot");
    if (!slot) {
      return false;
    }
    const expr = decl.templateExpressions[slot.slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return false;
    }
    const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
    if (!paramName) {
      return false;
    }
    if (
      expr.body?.type !== "LogicalExpression" ||
      (expr.body.operator !== "||" && expr.body.operator !== "??") ||
      expr.body.left?.type !== "MemberExpression"
    ) {
      return false;
    }
    const left = expr.body.left as any;
    if (left.object?.type !== "Identifier" || left.object.name !== paramName) {
      return false;
    }
    if (left.property?.type !== "Identifier") {
      return false;
    }
    const jsxProp = left.property.name;
    const right = expr.body.right;
    const fallback = literalToStaticValue(right);
    if (fallback === null || typeof fallback === "boolean") {
      return false;
    }

    // Extract static prefix/suffix (e.g., unit suffixes like "ms" or "px")
    const { prefix, suffix } = extractStaticParts(d.value);
    const hasStaticParts = !!(prefix || suffix);

    // When there are static parts, we need a wrapper component to evaluate the template literal at runtime
    if (hasStaticParts) {
      decl.needsWrapperComponent = true;
      ensureShouldForwardPropDrop(decl, jsxProp);
    }

    // Default value into base style, plus a style function applied when prop is provided.
    for (const out of cssDeclarationToStylexDeclarations(d)) {
      const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
      // Wrap fallback with static parts if present (e.g., 0 -> "0ms")
      const baseValue = hasStaticParts ? `${prefix}${fallback}${suffix}` : fallback;
      styleObj[out.prop] = baseValue;

      if (hasStaticParts) {
        // When there are static parts, build callArg as template literal: `${$prop ?? fallback}ms`
        // Use condition: "always" because the callArg handles the null case with ?? operator
        const propAccess = j.identifier(jsxProp);
        const logicalExpr = j.logicalExpression(
          expr.body.operator,
          propAccess,
          j.literal(fallback),
        );
        const callArg = buildTemplateWithStaticParts(j, logicalExpr, prefix, suffix);
        styleFnFromProps.push({ fnKey, jsxProp, callArg, condition: "always" });
      } else {
        styleFnFromProps.push({ fnKey, jsxProp });
      }

      if (!styleFnDecls.has(fnKey)) {
        const paramName = cssPropertyToIdentifier(out.prop);
        const param = j.identifier(paramName);
        // When there are static parts, the param type should be string (since we pass template literal)
        if (hasStaticParts) {
          setIdentifierTypeAnnotation(param, j.tsTypeAnnotation(j.tsStringKeyword()));
        } else {
          annotateParamFromJsxProp(param, jsxProp);
        }
        const p = makeCssProperty(j, out.prop, paramName);
        styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], j.objectExpression([p])));
      }
    }
    return true;
  };

  const tryHandleConditionalPropCoalesceWithTheme = (d: any): boolean => {
    if (d.value.kind !== "interpolated") {
      return false;
    }
    if (!d.property) {
      return false;
    }
    const parts = d.value.parts ?? [];
    if (parts.length !== 1 || parts[0]?.kind !== "slot") {
      return false;
    }
    const slotId = parts[0].slotId;
    const expr = decl.templateExpressions[slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return false;
    }
    const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
    if (!paramName) {
      return false;
    }
    const body = expr.body as any;
    if (!body || body.type !== "ConditionalExpression") {
      return false;
    }

    const testPath = getMemberPathFromIdentifier(body.test as any, paramName);
    if (!testPath || testPath.length !== 1) {
      return false;
    }
    const conditionProp = testPath[0]!;

    const resolveThemeAst = (node: any): ExpressionKind | null => {
      if (hasLocalThemeBinding) {
        return null;
      }
      const path = getMemberPathFromIdentifier(node as any, paramName);
      if (!path || path[0] !== "theme") {
        return null;
      }
      const themePath = path.slice(1).join(".");
      if (!themePath) {
        return null;
      }
      const resolved = resolveValue({
        kind: "theme",
        path: themePath,
        filePath,
        loc: getNodeLocStart(node) ?? undefined,
      });
      if (!resolved) {
        return null;
      }
      for (const imp of resolved.imports ?? []) {
        resolverImports.set(JSON.stringify(imp), imp);
      }
      const exprAst = parseExpr(resolved.expr);
      if (!exprAst) {
        return null;
      }
      return exprAst as ExpressionKind;
    };

    const readPropAccess = (node: any): string | null => {
      const path = getMemberPathFromIdentifier(node as any, paramName);
      if (!path || path.length !== 1) {
        return null;
      }
      return path[0]!;
    };

    const parseNullishBranch = (
      node: any,
    ): { propName: string; fallback: ExpressionKind } | null => {
      if (!node || node.type !== "LogicalExpression" || node.operator !== "??") {
        return null;
      }
      const propName = readPropAccess(node.left);
      if (!propName) {
        return null;
      }
      const fallback = resolveThemeAst(node.right);
      if (!fallback) {
        return null;
      }
      return { propName, fallback };
    };

    const consNullish = parseNullishBranch(body.consequent);
    const altNullish = parseNullishBranch(body.alternate);
    const consTheme = resolveThemeAst(body.consequent);
    const altTheme = resolveThemeAst(body.alternate);

    const buildPropAccess = (prop: string): ExpressionKind => {
      const isIdent = /^[$A-Z_][0-9A-Z_$]*$/i.test(prop);
      return isIdent
        ? j.memberExpression(j.identifier("props"), j.identifier(prop))
        : j.memberExpression(j.identifier("props"), j.literal(prop), true);
    };

    let nullishPropName: string | null = null;
    let baseTheme: ExpressionKind | null = null;
    let fallbackTheme: ExpressionKind | null = null;
    let conditionWhen: string | null = null;
    if (consNullish && altTheme) {
      baseTheme = altTheme;
      fallbackTheme = consNullish.fallback;
      nullishPropName = consNullish.propName;
      conditionWhen = conditionProp;
    } else if (altNullish && consTheme) {
      baseTheme = consTheme;
      fallbackTheme = altNullish.fallback;
      nullishPropName = altNullish.propName;
      conditionWhen = `!${conditionProp}`;
    } else {
      return false;
    }

    if (!baseTheme || !fallbackTheme || !nullishPropName || !conditionWhen) {
      return false;
    }

    const outs = cssDeclarationToStylexDeclarations(d);
    for (const out of outs) {
      (styleObj as any)[out.prop] = baseTheme as any;
      const baseFnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
      let fnKey = baseFnKey;
      if (styleFnDecls.has(fnKey)) {
        let idx = 1;
        while (styleFnDecls.has(`${baseFnKey}Alt${idx}`)) {
          idx += 1;
        }
        fnKey = `${baseFnKey}Alt${idx}`;
      }
      if (!styleFnDecls.has(fnKey)) {
        const paramName = cssPropertyToIdentifier(out.prop);
        const param = j.identifier(paramName);
        annotateParamFromJsxProp(param, nullishPropName);
        const bodyExpr = j.objectExpression([makeCssProperty(j, out.prop, paramName)]);
        styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
      }
      if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
        const isIdent = /^[$A-Z_][0-9A-Z_$]*$/i.test(nullishPropName);
        const baseArg = isIdent ? j.identifier(nullishPropName) : buildPropAccess(nullishPropName);
        const callArg = j.logicalExpression("??", baseArg, fallbackTheme);
        styleFnFromProps.push({
          fnKey,
          jsxProp: conditionProp,
          conditionWhen,
          callArg,
        });
      }
    }

    ensureShouldForwardPropDrop(decl, conditionProp);
    ensureShouldForwardPropDrop(decl, nullishPropName);
    decl.needsWrapperComponent = true;
    return true;
  };

  const tryHandleEnumIfChainValue = (
    d: any,
    opts: {
      media?: string | null;
      attrTarget?: Record<string, unknown> | null;
      pseudos?: string[] | null;
    },
  ): boolean => {
    if (d.value.kind !== "interpolated") {
      return false;
    }
    if (!d.property) {
      return false;
    }
    // Only apply to base declarations; variant expansion for pseudo/media/attr buckets is more complex.
    if (opts.pseudos?.length || opts.media || opts.attrTarget) {
      return false;
    }
    const parts = d.value.parts ?? [];
    const slotPart = parts.find((p: any) => p.kind === "slot");
    if (!slotPart || slotPart.kind !== "slot") {
      return false;
    }
    const slotId = slotPart.slotId;
    const expr = decl.templateExpressions[slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return false;
    }
    const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
    if (!paramName) {
      return false;
    }
    if (expr.body?.type !== "BlockStatement") {
      return false;
    }

    type Case = { when: string; value: string | number };
    const cases: Case[] = [];
    let defaultValue: string | number | null = null;
    let propName: string | null = null;

    const readIfReturnValue = (ifStmt: any): string | number | null => {
      const cons = ifStmt.consequent;
      if (!cons) {
        return null;
      }
      if (cons.type === "ReturnStatement") {
        const value = literalToStaticValue(cons.argument);
        if (value === null || typeof value === "boolean") {
          return null;
        }
        return value;
      }
      if (cons.type === "BlockStatement") {
        const ret = (cons.body ?? []).find((s: any) => s?.type === "ReturnStatement");
        if (!ret) {
          return null;
        }
        const value = literalToStaticValue(ret.argument);
        if (value === null || typeof value === "boolean") {
          return null;
        }
        return value;
      }
      return null;
    };

    const bodyStmts = expr.body.body ?? [];
    for (const stmt of bodyStmts) {
      if (!stmt) {
        continue;
      }
      if (stmt.type === "IfStatement") {
        // Only support `if (...) { return <literal>; }` with no else.
        if (stmt.alternate) {
          return false;
        }
        const test = stmt.test as any;
        if (
          !test ||
          test.type !== "BinaryExpression" ||
          test.operator !== "===" ||
          test.left?.type !== "MemberExpression"
        ) {
          return false;
        }
        const left = test.left as any;
        const leftPath = getMemberPathFromIdentifier(left, paramName);
        if (!leftPath || leftPath.length !== 1) {
          return false;
        }
        const p = leftPath[0]!;
        propName = propName ?? p;
        if (propName !== p) {
          return false;
        }
        const rhs = literalToStaticValue(test.right);
        if (rhs === null) {
          return false;
        }
        const retValue = readIfReturnValue(stmt);
        if (retValue === null) {
          return false;
        }
        const cond = `${propName} === ${JSON.stringify(rhs)}`;
        cases.push({ when: cond, value: retValue });
        continue;
      }
      if (stmt.type === "ReturnStatement") {
        const value = literalToStaticValue(stmt.argument);
        if (value === null || typeof value === "boolean") {
          return false;
        }
        defaultValue = value;
        continue;
      }
      // Any other statement shape => too risky.
      return false;
    }

    if (!propName || defaultValue === null || cases.length === 0) {
      return false;
    }

    ensureShouldForwardPropDrop(decl, propName);

    const styleFromValue = (value: string | number): Record<string, unknown> => {
      const valueRaw = typeof value === "number" ? String(value) : value;
      const irDecl = {
        property: d.property,
        value: { kind: "static" as const, value: valueRaw },
        important: false,
        valueRaw,
      };
      const out: Record<string, unknown> = {};
      for (const mapped of cssDeclarationToStylexDeclarations(irDecl as any)) {
        out[mapped.prop] =
          typeof value === "number" ? value : cssValueToJs(mapped.value, false, mapped.prop);
      }
      return out;
    };

    // Default goes into base style.
    Object.assign(styleObj, styleFromValue(defaultValue));

    // Cases become variant buckets keyed by expression strings.
    for (const c of cases) {
      variantBuckets.set(c.when, {
        ...variantBuckets.get(c.when),
        ...styleFromValue(c.value),
      });
      variantStyleKeys[c.when] ??= `${decl.styleKey}${toSuffixFromProp(c.when)}`;
    }

    return true;
  };

  const tryHandleThemeIndexedLookup = (
    d: any,
    opts: {
      media?: string | null;
      attrTarget?: Record<string, unknown> | null;
      pseudos?: string[] | null;
    },
  ): boolean => {
    if (d.value.kind !== "interpolated") {
      return false;
    }
    if (!d.property) {
      return false;
    }
    // Skip media/attr buckets for now; these require more complex wiring.
    if (opts.media || opts.attrTarget) {
      return false;
    }
    const parts = d.value.parts ?? [];
    const slotPart = parts.find((p: any) => p.kind === "slot");
    if (!slotPart || slotPart.kind !== "slot") {
      return false;
    }
    const slotId = slotPart.slotId;
    const expr = decl.templateExpressions[slotId] as any;
    if (!expr || expr.type !== "ArrowFunctionExpression") {
      return false;
    }
    const paramName =
      expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
    if (!paramName) {
      return false;
    }
    const body = expr.body as any;
    if (!body || body.type !== "MemberExpression" || body.computed !== true) {
      return false;
    }

    const indexPropName = (() => {
      const p = body.property as any;
      if (!p || typeof p !== "object") {
        return null;
      }
      if (p.type === "Identifier" && typeof p.name === "string") {
        return p.name as string;
      }
      if (p.type === "MemberExpression") {
        const path = getMemberPathFromIdentifier(p as any, paramName);
        if (!path || path.length !== 1) {
          return null;
        }
        return path[0]!;
      }
      return null;
    })();
    if (!indexPropName) {
      return false;
    }

    const themeObjectPath = (() => {
      const obj = body.object as any;
      if (!obj || obj.type !== "MemberExpression") {
        return null;
      }
      const parts = getMemberPathFromIdentifier(obj as any, paramName);
      if (!parts || parts.length < 2) {
        return null;
      }
      if (parts[0] !== "theme") {
        return null;
      }
      return parts.slice(1).join(".");
    })();
    if (!themeObjectPath) {
      return false;
    }

    const resolved = resolveValue({
      kind: "theme",
      path: themeObjectPath,
      filePath,
      loc: getNodeLocStart(body.object) ?? undefined,
    });
    if (!resolved) {
      return false;
    }

    for (const imp of resolved.imports ?? []) {
      resolverImports.set(JSON.stringify(imp), imp);
    }

    // Ensure we generate a wrapper so we can consume the prop without forwarding it to DOM.
    ensureShouldForwardPropDrop(decl, indexPropName);

    const outs = cssDeclarationToStylexDeclarations(d);
    for (const out of outs) {
      if (!out.prop) {
        continue;
      }
      const pseudoSuffix = (p: string): string => {
        // `:hover` -> `Hover`, `:focus-visible` -> `FocusVisible`
        const raw = p.trim().replace(/^:+/, "");
        const cleaned = raw
          .split(/[^a-zA-Z0-9]+/g)
          .filter(Boolean)
          .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
          .join("");
        return cleaned || "Pseudo";
      };

      const firstPseudo = opts.pseudos?.[0];
      const fnKey =
        opts.pseudos?.length && firstPseudo
          ? `${decl.styleKey}${toSuffixFromProp(out.prop)}${pseudoSuffix(firstPseudo)}`
          : `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
      styleFnFromProps.push({ fnKey, jsxProp: indexPropName });

      if (!styleFnDecls.has(fnKey)) {
        // Build expression: resolvedExpr[indexPropName]
        // NOTE: This is TypeScript-only syntax (TSAsExpression + `keyof typeof`),
        // so we parse it explicitly with a TSX parser here rather than relying on
        // the generic `parseExpr` helper.
        const resolvedExprAst = parseExpr(resolved.expr);
        const paramName = buildSafeIndexedParamName(indexPropName, resolvedExprAst);
        const indexedExprAst = (() => {
          // We intentionally do NOT add `as keyof typeof themeVars` fallbacks.
          // If a fixture uses a `string` key to index theme colors, it should be fixed at the
          // input/type level to use a proper key union (e.g. `Colors`), and the output should
          // reflect that contract.
          const exprSource = `(${resolved.expr})[${paramName}]`;
          try {
            const jParse = api.jscodeshift.withParser("tsx");
            const program = jParse(`(${exprSource});`);
            const stmt = program.find(jParse.ExpressionStatement).nodes()[0];
            let expr = stmt?.expression ?? null;
            while (expr?.type === "ParenthesizedExpression") {
              expr = expr.expression;
            }
            // Remove extra.parenthesized flag that causes recast to add parentheses
            const exprWithExtra = expr as ExpressionKind & {
              extra?: { parenthesized?: boolean; parenStart?: number };
            };
            if (exprWithExtra?.extra?.parenthesized) {
              delete exprWithExtra.extra.parenthesized;
              delete exprWithExtra.extra.parenStart;
            }
            return expr;
          } catch {
            return null;
          }
        })();
        if (!indexedExprAst) {
          warnings.push({
            severity: "error",
            type: "Adapter resolveCall returned an unparseable styles expression",
            loc: decl.loc,
            context: { localName: decl.localName, resolved },
          });
          markBail();
          continue;
        }

        const param = j.identifier(paramName);
        // Prefer the prop's own type when available (e.g. `Color` / `Colors`) so we don't end up with
        // `keyof typeof themeVars` in fixture outputs.
        const propTsType = findJsxPropTsType(indexPropName);
        (param as any).typeAnnotation = j.tsTypeAnnotation(
          (propTsType && typeof propTsType === "object" && (propTsType as any).type
            ? (propTsType as any)
            : j.tsStringKeyword()) as any,
        );
        if (opts.pseudos?.length) {
          const pseudoEntries = [
            j.property("init", j.identifier("default"), j.literal(null)),
            ...opts.pseudos.map((ps) => j.property("init", j.literal(ps), indexedExprAst as any)),
          ];
          const propValue = j.objectExpression(pseudoEntries);
          styleFnDecls.set(
            fnKey,
            j.arrowFunctionExpression(
              [param],
              j.objectExpression([j.property("init", j.identifier(out.prop), propValue) as any]),
            ),
          );
        } else {
          const p = j.property("init", j.identifier(out.prop), indexedExprAst as any) as any;
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], j.objectExpression([p])));
        }
      }
    }

    return true;
  };

  return {
    tryHandleMappedFunctionColor,
    tryHandleLogicalOrDefault,
    tryHandleConditionalPropCoalesceWithTheme,
    tryHandleEnumIfChainValue,
    tryHandleThemeIndexedLookup,
  };
};
