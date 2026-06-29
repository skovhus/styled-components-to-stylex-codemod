/**
 * Collects styled declarations and metadata from the AST.
 * Core concepts: template parsing and pre-resolved style detection.
 */
import type { Collection } from "jscodeshift";
import {
  computeUniversalSelectorLoc,
  hasUniversalSelectorInRules,
  normalizeStylisAstToIR,
  type CssRuleIR,
} from "./css-ir.js";
import {
  cloneAstNode,
  extractStaticLiteralValue,
  getFunctionBodyExpr,
  getNodeLocStart,
  locateDeclarationInProgram,
} from "./utilities/jscodeshift-utils.js";
import { resolveBackgroundStylexProp } from "./css-prop-mapping.js";
import { parseStyledTemplateLiteral } from "./styled-css.js";
import type { StyledDecl } from "./transform-types.js";
import { stripStyledPrefix, toStyleKey, styleKeyWithSuffix } from "./transform/helpers.js";
import {
  getCommentBody,
  isValidIdentifierName,
  isPrettierIgnoreComment,
  isStyleSectionMarkerComment,
} from "./utilities/string-utils.js";

/**
 * Collect styled component declarations and pre-resolved object-style decls.
 *
 * This module is intentionally "dumb": it only *collects* declarations and metadata.
 * It does not emit styles or rewrite JSX.
 */
export function collectStyledDecls(args: {
  root: Collection<any>;
  j: any;
  styledDefaultImport: string | undefined;
  cssLocal?: string;
}): {
  styledDecls: StyledDecl[];
  hasUniversalSelectors: boolean;
  universalSelectorLoc: { line: number; column: number } | null;
} {
  return collectStyledDeclsImpl(args);
}

function collectStyledDeclsImpl(args: {
  root: Collection<any>;
  j: any;
  styledDefaultImport: string | undefined;
  cssLocal?: string;
}): {
  styledDecls: StyledDecl[];
  hasUniversalSelectors: boolean;
  universalSelectorLoc: { line: number; column: number } | null;
} {
  const { root, j, styledDefaultImport, cssLocal } = args;

  const styledDecls: StyledDecl[] = [];
  let hasUniversalSelectors = false;
  let universalSelectorLoc: { line: number; column: number } | null = null;

  const noteUniversalSelector = (template: unknown, rawCss: string): void => {
    hasUniversalSelectors = true;
    if (universalSelectorLoc) {
      return;
    }
    universalSelectorLoc = computeUniversalSelectorLoc(getNodeLocStart(template), rawCss);
  };
  const noteUniversalSelectorIfPresent = (
    template: unknown,
    rawCss: string,
    rules: CssRuleIR[],
  ) => {
    const hasUniversalSelector = hasUniversalSelectorInRules(rules);
    if (hasUniversalSelector) {
      noteUniversalSelector(template, rawCss);
    }
    return hasUniversalSelector;
  };

  /**
   * Convert a MemberExpression AST node to a string like "animated.div".
   * Returns null if the expression doesn't match the expected pattern.
   */
  const memberExprToIdent = (expr: any): string | null => {
    if (
      expr?.type === "MemberExpression" &&
      expr.object?.type === "Identifier" &&
      expr.property?.type === "Identifier"
    ) {
      return `${expr.object.name}.${expr.property.name}`;
    }
    return null;
  };

  const parseAttrsArg = (arg0: any): StyledDecl["attrsInfo"] | undefined => {
    if (!arg0) {
      return undefined;
    }
    // Use Omit + Required to make all fields non-optional, then add optional fields back
    const out: Omit<
      Required<NonNullable<StyledDecl["attrsInfo"]>>,
      "attrsAsTag" | "attrsStaticStyles" | "attrsStaticStyleExpr" | "attrsDynamicStyles"
    > & {
      attrsAsTag?: string;
      attrsStaticStyles?: Record<string, unknown>;
      attrsStaticStyleExpr?: NonNullable<StyledDecl["attrsInfo"]>["attrsStaticStyleExpr"];
      attrsDynamicStyles?: Array<{
        cssProp: string;
        jsxProp: string;
        callArgExpr: unknown;
        condition?: "truthy" | "always";
      }>;
    } = {
      staticAttrs: {},
      sourceKind: "unknown",
      hasUnsupportedValues: false,
      defaultAttrs: [],
      dynamicAttrs: [],
      conditionalAttrs: [],
      invertedBoolAttrs: [],
    };

    const fillFromObject = (obj: any, attrsParamInfo: AttrsParamInfo = emptyAttrsParamInfo()) => {
      for (const prop of obj.properties ?? []) {
        if (!prop) {
          continue;
        }
        if (prop.type !== "ObjectProperty" && prop.type !== "Property") {
          // Spreading the callback's own props param just re-forwards props (the
          // emitted wrapper already does `{...props}`), so it can be dropped. Any
          // other non-property entry — spreads of external objects, getters/setters
          // — supplies values we cannot enumerate, so mark unsupported and let the
          // decl bail instead of silently erasing those props.
          if (!isPropsParamSpread(prop, attrsParamInfo)) {
            out.hasUnsupportedValues = true;
          }
          continue;
        }
        const key =
          prop.key.type === "Identifier"
            ? prop.key.name
            : prop.key.type === "StringLiteral"
              ? prop.key.value
              : null;
        if (!key) {
          continue;
        }

        const v = prop.value as any;
        const literalValue = literalStaticValueFromNode(v);
        if (literalValue !== undefined) {
          out.staticAttrs[key] = literalValue;
          continue;
        }

        // Support: as: ComponentRef (overrides rendered element)
        if (key === "as" && v.type === "Identifier" && v.name !== "undefined") {
          out.attrsAsTag = v.name;
          continue;
        }

        if (key === "as") {
          const asTag = staticAttrExpressionToReference(v, attrsParamInfo);
          if (asTag) {
            out.attrsAsTag = asTag;
            continue;
          }
        }

        if (key === "style" && isStaticAttrExpression(v, attrsParamInfo)) {
          out.attrsStaticStyleExpr = cloneAstNode(v) as NonNullable<
            StyledDecl["attrsInfo"]
          >["attrsStaticStyleExpr"];
          continue;
        }

        const dynamicAttrProp = extractPropName(v, attrsParamInfo);
        if (dynamicAttrProp) {
          const dynamicAttrDefault = extractPropDefault(v, attrsParamInfo);
          out.dynamicAttrs.push({
            jsxProp: dynamicAttrProp,
            attrName: key,
            ...(dynamicAttrDefault !== undefined ? { defaultValue: dynamicAttrDefault } : {}),
          });
          continue;
        }

        // Hoist static value expressions (module-scope references plus object/
        // array literals composed of static parts) verbatim. The `style` key is
        // intentionally excluded so the stylex extraction below stays
        // authoritative for inline style objects.
        if (key !== "style" && isStaticValueExpression(v, attrsParamInfo)) {
          out.staticAttrs[key] = cloneAstNode(v);
          continue;
        }

        // Support static attrs explicitly set to undefined or null.
        if ((v.type === "Identifier" && v.name === "undefined") || v.type === "NullLiteral") {
          out.staticAttrs[key] = v.type === "NullLiteral" ? null : undefined;
          continue;
        }

        // Support: tabIndex: props.tabIndex ?? 0
        // This provides a default value that can be overridden by passed props.
        if (
          (v.type === "LogicalExpression" && v.operator === "??") ||
          v.type === "TSNullishCoalescingExpression"
        ) {
          const left = v.left as any;
          const right = v.right as any;
          const leftPropName = extractPropName(left, attrsParamInfo);
          if (
            leftPropName &&
            (right?.type === "StringLiteral" ||
              right?.type === "NumericLiteral" ||
              right?.type === "BooleanLiteral")
          ) {
            out.defaultAttrs.push({
              jsxProp: leftPropName,
              attrName: key,
              value: right.value,
            });
            continue;
          }
        }

        // Support: size: props.$small ? 5 : undefined
        if (v.type === "ConditionalExpression") {
          const test = v.test as any;
          const cons = v.consequent as any;
          const alt = v.alternate as any;
          if (
            test?.type === "MemberExpression" &&
            test.property?.type === "Identifier" &&
            test.property.name.startsWith("$") &&
            cons?.type === "NumericLiteral" &&
            alt?.type === "Identifier" &&
            alt.name === "undefined"
          ) {
            out.conditionalAttrs.push({
              jsxProp: test.property.name,
              attrName: key,
              value: cons.value,
            });
            continue;
          }
        }

        // Support: "data-attr": props.propName !== true
        // When prop is undefined/not passed, `undefined !== true` is `true`.
        // When prop is true, `true !== true` is `false`.
        if (
          v.type === "BinaryExpression" &&
          v.operator === "!==" &&
          v.right?.type === "BooleanLiteral" &&
          v.right.value === true &&
          v.left?.type === "MemberExpression" &&
          v.left.object?.type === "Identifier" &&
          (v.left.object.name === "props" || v.left.object.name === "p") &&
          v.left.property?.type === "Identifier"
        ) {
          out.invertedBoolAttrs.push({
            jsxProp: v.left.property.name,
            attrName: key,
          });
          continue;
        }

        // Support: style: { whiteSpace: "nowrap" } or style: { height: $prop ? value : undefined }
        if (
          key === "style" &&
          v.type === "ObjectExpression" &&
          tryExtractStyleObject(v, out, attrsParamInfo.propNames, resolveModuleScopeStaticValue)
        ) {
          continue;
        }

        out.hasUnsupportedValues = true;
      }
    };

    if (arg0.type === "ObjectExpression") {
      out.sourceKind = "object";
      fillFromObject(arg0);
      return out;
    }

    if (arg0.type === "ArrowFunctionExpression") {
      out.sourceKind = "function";
      const attrsParamInfo = getAttrsParamInfo(arg0.params);
      const body = arg0.body as any;
      if (body?.type === "ObjectExpression") {
        fillFromObject(body, attrsParamInfo);
        return out;
      }
      if (body?.type === "BlockStatement") {
        const ret = body.body.find((s: any) => s.type === "ReturnStatement") as any;
        if (ret?.argument?.type === "ObjectExpression") {
          fillFromObject(ret.argument, {
            ...attrsParamInfo,
            // Merge (not replace) so nested param destructuring bindings collected
            // by getAttrsParamInfo are kept alongside block-local declarations.
            localNames: new Set([...attrsParamInfo.localNames, ...collectBlockLocalNames(body)]),
          });
          return out;
        }
      }
    }

    return out;
  };

  const shouldForceWrapperForAttrs = (attrsInfo: StyledDecl["attrsInfo"] | undefined): boolean => {
    if (!attrsInfo) {
      return false;
    }
    const props = new Set<string>();
    for (const c of attrsInfo.conditionalAttrs ?? []) {
      if (typeof c?.jsxProp === "string") {
        props.add(c.jsxProp);
      }
    }
    for (const a of attrsInfo.defaultAttrs ?? []) {
      if (typeof a?.jsxProp === "string") {
        props.add(a.jsxProp);
      }
    }
    for (const inv of attrsInfo.invertedBoolAttrs ?? []) {
      if (typeof inv?.jsxProp === "string") {
        props.add(inv.jsxProp);
      }
    }
    // If attrs depend on transient props ($...), emit a wrapper so we can consume those props
    // (and avoid forwarding them to the DOM) without trying to specialize per callsite.
    return [...props].some((p) => p.startsWith("$"));
  };

  type ShouldForwardPropResult =
    | { parsed: StyledDecl["shouldForwardProp"]; unparseable?: false }
    | { parsed?: undefined; unparseable: true };

  const isModuleScopeDeclarator = (path: any): boolean => {
    if (path?.scope?.isGlobal === true) {
      return true;
    }

    // Fallback for parser/path variants where scope metadata is missing:
    // walk up and ensure we hit Program without entering a function body.
    let cur = path?.parentPath;
    while (cur?.node) {
      const nodeType = cur.node.type;
      if (nodeType === "Program") {
        return true;
      }
      if (
        nodeType === "FunctionDeclaration" ||
        nodeType === "FunctionExpression" ||
        nodeType === "ArrowFunctionExpression"
      ) {
        return false;
      }
      cur = cur.parentPath;
    }
    return false;
  };

  const resolveModuleScopeStaticValue = (name: string): string | number | undefined => {
    const decls = root.find(j.VariableDeclarator).filter((path) => {
      const idNode = (path.node as any).id;
      if (idNode?.type !== "Identifier" || idNode.name !== name) {
        return false;
      }
      return isModuleScopeDeclarator(path);
    });
    if (decls.length !== 1) {
      return undefined;
    }
    const value = literalStaticValueFromNode((decls.get().node as any).init);
    return typeof value === "string" || typeof value === "number" ? value : undefined;
  };

  const parseShouldForwardProp = (arg0: any): ShouldForwardPropResult | undefined => {
    if (!arg0 || arg0.type !== "ObjectExpression") {
      return undefined;
    }
    const prop = (arg0.properties ?? []).find((p: any) => {
      if (!p || (p.type !== "ObjectProperty" && p.type !== "Property")) {
        return false;
      }
      if (p.key?.type === "Identifier") {
        return p.key.name === "shouldForwardProp";
      }
      if (p.key?.type === "StringLiteral") {
        return p.key.value === "shouldForwardProp";
      }
      return false;
    }) as any;
    if (!prop) {
      return undefined;
    }
    const fn = prop.value;
    if (!fn || (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression")) {
      // shouldForwardProp is present but not a function - can't parse
      return { unparseable: true };
    }
    const paramName = fn.params?.[0]?.type === "Identifier" ? fn.params[0].name : null;
    if (!paramName) {
      // Function has no identifiable parameter - can't parse
      return { unparseable: true };
    }
    // shouldForwardProp can take a second argument: (prop, elementToBeCreated)
    // If the function uses a second parameter, it may have element-dependent logic we can't transform
    if (fn.params?.length > 1) {
      return { unparseable: true };
    }

    const dropProps = new Set<string>();
    let dropPrefix: string | undefined;

    const collect = (expr: any): void => {
      if (!expr) {
        return;
      }

      // !["a","b"].includes(prop) or !varRef.includes(prop)
      if (expr.type === "UnaryExpression" && expr.operator === "!") {
        const inner = expr.argument;
        if (
          inner?.type === "CallExpression" &&
          inner.callee?.type === "MemberExpression" &&
          inner.callee.property?.type === "Identifier" &&
          inner.callee.property.name === "includes" &&
          inner.arguments?.[0]?.type === "Identifier" &&
          inner.arguments[0].name === paramName
        ) {
          // Resolve the array — either an inline ArrayExpression or a variable reference.
          // Restrict to module-scope declarations to avoid resolving shadowed variables
          // in nested scopes. shouldForwardProp configs and their referenced arrays are
          // always at module scope.
          let arrayNode = inner.callee.object;
          if (arrayNode?.type === "Identifier") {
            const varName = arrayNode.name;
            const decls = root.find(j.VariableDeclarator).filter((path) => {
              const idNode = (path.node as any).id;
              if (idNode?.type !== "Identifier" || idNode.name !== varName) {
                return false;
              }
              return isModuleScopeDeclarator(path);
            });
            if (decls.length > 0) {
              const init = (decls.get().node as any).init;
              if (init?.type === "ArrayExpression") {
                arrayNode = init;
              }
            }
          }
          if (arrayNode?.type === "ArrayExpression") {
            for (const el of arrayNode.elements ?? []) {
              if (el?.type === "Literal" && typeof el.value === "string") {
                dropProps.add(el.value);
              }
              if (el?.type === "StringLiteral") {
                dropProps.add(el.value);
              }
            }
            return;
          }
        }

        // !prop.startsWith("$")
        if (
          inner?.type === "CallExpression" &&
          inner.callee?.type === "MemberExpression" &&
          inner.callee.object?.type === "Identifier" &&
          inner.callee.object.name === paramName &&
          inner.callee.property?.type === "Identifier" &&
          inner.callee.property.name === "startsWith" &&
          inner.arguments?.[0] &&
          ((inner.arguments[0].type === "Literal" &&
            typeof inner.arguments[0].value === "string") ||
            inner.arguments[0].type === "StringLiteral")
        ) {
          dropPrefix =
            inner.arguments[0].type === "StringLiteral"
              ? inner.arguments[0].value
              : inner.arguments[0].value;
          return;
        }
      }

      // prop !== "x" / prop != "x" (i.e., allow everything except x)
      if (
        expr.type === "BinaryExpression" &&
        (expr.operator === "!==" || expr.operator === "!=") &&
        expr.left?.type === "Identifier" &&
        expr.left.name === paramName
      ) {
        if (expr.right?.type === "Literal" && typeof expr.right.value === "string") {
          dropProps.add(expr.right.value);
          return;
        }
        if (expr.right?.type === "StringLiteral") {
          dropProps.add(expr.right.value);
          return;
        }
      }

      // isPropValid(prop) && prop !== "x"
      if (expr.type === "LogicalExpression" && expr.operator === "&&") {
        collect(expr.left);
        collect(expr.right);
        return;
      }
    };

    collect(getFunctionBodyExpr(fn));

    const dropPropsArr = [...dropProps];
    if (!dropPropsArr.length && !dropPrefix) {
      // shouldForwardProp is present but uses an unsupported pattern
      return { unparseable: true };
    }
    return {
      parsed: {
        dropProps: dropPropsArr,
        ...(dropPrefix ? { dropPrefix } : {}),
      },
    };
  };

  const parseWithConfigMeta = (arg0: any): StyledDecl["withConfig"] | undefined => {
    if (!arg0 || arg0.type !== "ObjectExpression") {
      return undefined;
    }
    let componentId: string | undefined;
    for (const p of arg0.properties ?? []) {
      if (!p || (p.type !== "ObjectProperty" && p.type !== "Property")) {
        continue;
      }
      const key =
        p.key?.type === "Identifier"
          ? p.key.name
          : p.key?.type === "StringLiteral"
            ? p.key.value
            : null;
      if (!key) {
        continue;
      }
      const v: any = p.value;
      const val =
        v?.type === "StringLiteral"
          ? v.value
          : v?.type === "Literal" && typeof v.value === "string"
            ? v.value
            : null;
      if (!val) {
        continue;
      }
      if (key === "componentId") {
        componentId = val;
      }
    }
    if (!componentId) {
      return undefined;
    }
    return { componentId };
  };

  /**
   * Unwrap TS generic instantiation wrappers and capture the first type argument, e.g.:
   * - styled.button<ButtonProps>`...`
   * - styled(Component)<CardProps>`...`
   *
   * Babel/Recast may represent this as:
   * - TSInstantiationExpression { expression, typeParameters }
   * - or an expression node with `.typeParameters` / `.typeArguments`
   */
  const unwrapTypeInstantiation = (expr: any): { expr: any; propsType: any } => {
    let cur = expr;
    let propsType: any;

    const readFirstTypeArg = (tp: any): any => {
      if (!tp) {
        return undefined;
      }
      const arr =
        (Array.isArray(tp.params) ? tp.params : null) ??
        (Array.isArray(tp.parameters) ? tp.parameters : null) ??
        (Array.isArray(tp.typeParameters) ? tp.typeParameters : null);
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined;
    };

    // Prefer TSInstantiationExpression wrapper (Babel)
    while (cur && cur.type === "TSInstantiationExpression") {
      if (!propsType) {
        propsType = readFirstTypeArg(cur.typeParameters);
      }
      cur = cur.expression;
    }

    // Some parsers attach type params directly to CallExpression/MemberExpression/etc.
    if (!propsType) {
      propsType =
        readFirstTypeArg(cur?.typeParameters) ?? readFirstTypeArg(cur?.typeArguments) ?? undefined;
    }

    return { expr: cur, propsType };
  };

  // Some parsers attach generic type args to the TaggedTemplateExpression itself.
  // (e.g. `styled.div.withConfig(...)<Props>\`...\`` where `<Props>` ends up on the tag wrapper.)
  const readFirstTypeArgFromNode = (node: any): any => {
    if (!node) {
      return undefined;
    }
    const tp = (node as any).typeParameters ?? (node as any).typeArguments ?? undefined;
    if (!tp) {
      return undefined;
    }
    const arr =
      (Array.isArray(tp.params) ? tp.params : null) ??
      (Array.isArray(tp.parameters) ? tp.parameters : null) ??
      (Array.isArray(tp.typeParameters) ? tp.typeParameters : null);
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined;
  };

  /**
   * Extract preserved leading comments from the parent VariableDeclaration if it has a single
   * declarator.
   */
  const getLeadingComments = (declaratorPath: any): any[] | undefined => {
    const parentPath = declaratorPath.parentPath;
    if (!parentPath || parentPath.node?.type !== "VariableDeclaration") {
      return;
    }
    // Only capture comments if this is the sole declarator (const X = ...; not const X = ..., Y = ...;)
    if (parentPath.node.declarations?.length !== 1) {
      return;
    }
    // Comments may be attached to the VariableDeclaration itself OR to an enclosing
    // ExportNamedDeclaration (e.g. `export const X = ...`) depending on the parser/printer.
    let comments = parentPath.node.comments ?? parentPath.node.leadingComments;
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      // In practice, jscodeshift paths sometimes insert intermediate "VariableDeclaration" paths
      // between a declarator and the `ExportNamedDeclaration`, so walk up to find the export wrapper.
      let cur = parentPath.parentPath;
      while (cur && cur.node) {
        if (cur.node.type === "ExportNamedDeclaration") {
          const decl = cur.node.declaration;
          if (decl?.type === "VariableDeclaration") {
            // Preserve all leading comments from exported declarations.
            const exportComments = (cur.node.comments ?? cur.node.leadingComments) as any;
            comments = Array.isArray(exportComments) ? exportComments : undefined;
            break;
          }
        }
        cur = cur.parentPath;
      }
    }
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return;
    }
    const filtered = comments.filter((c: unknown) => !shouldDropStyledLeadingComment(c));
    return filtered.length > 0 ? filtered : undefined;
  };

  /**
   * Best-effort placement hints for emitting `stylex.create(...)` near the original
   * styled declaration. We record:
   * - `declIndex`: index of the VariableDeclaration statement in Program.body
   * - `insertAfterName`: name of the previous top-level var/function declaration (when unambiguous)
   */
  const getPlacementHints = (
    declaratorPath: any,
  ): { declIndex?: number; insertAfterName?: string } => {
    const located = locateDeclarationInProgram(root, declaratorPath);
    if (!located) {
      return {};
    }
    const { programBody, index: idx } = located;
    if (idx < 0) {
      return {};
    }

    const prev = idx > 0 ? programBody[idx - 1] : null;
    const prevName = (() => {
      if (!prev) {
        return undefined;
      }
      if (prev.type === "VariableDeclaration") {
        const ds = prev.declarations ?? [];
        if (ds.length !== 1) {
          return undefined;
        }
        const id = ds[0]?.id;
        return id?.type === "Identifier" ? id.name : undefined;
      }
      if (prev.type === "FunctionDeclaration") {
        const id = prev.id;
        return id?.type === "Identifier" ? id.name : undefined;
      }
      return undefined;
    })();

    return {
      declIndex: idx,
      ...(prevName ? { insertAfterName: prevName } : {}),
    };
  };

  /**
   * Peel .attrs() and .withConfig() method calls from a tagged-template tag expression.
   * Handles single-method chains (e.g., .attrs(...)) and two-level chains
   * (e.g., .withConfig(...).attrs(...)) in any order.
   * Returns null if no chain methods were found or if duplicate methods are detected
   * (e.g., .attrs(a).attrs(b)), since composing multiple attrs layers is not supported.
   */
  const peelChainMethods = (
    tag: any,
  ): {
    base: any;
    attrsArg: any;
    withConfigArg: any;
    chainPropsType: any;
  } | null => {
    let cur = tag;
    let attrsArg: any;
    let withConfigArg: any;
    let chainPropsType: any;
    let peeled = false;

    while (
      cur?.type === "CallExpression" &&
      cur.callee?.type === "MemberExpression" &&
      cur.callee.property?.type === "Identifier" &&
      (cur.callee.property.name === "attrs" || cur.callee.property.name === "withConfig")
    ) {
      peeled = true;
      if (cur.callee.property.name === "attrs") {
        if (attrsArg !== undefined) {
          return null;
        }
        attrsArg = cur.arguments?.[0];
      } else {
        if (withConfigArg !== undefined) {
          return null;
        }
        withConfigArg = cur.arguments?.[0];
      }
      if (!chainPropsType) {
        chainPropsType = readFirstTypeArgFromNode(cur);
      }
      cur = cur.callee.object;
      const unwrapped = unwrapTypeInstantiation(cur);
      if (unwrapped.propsType && !chainPropsType) {
        chainPropsType = unwrapped.propsType;
      }
      cur = unwrapped.expr;
    }

    if (!peeled) {
      return null;
    }
    return { base: cur, attrsArg, withConfigArg, chainPropsType };
  };

  /**
   * Identify the styled base expression after chain methods have been peeled.
   * Recognizes styled.tag, styled("tag"), styled(Component), and styled(Component.sub).
   * Returns null if the base is not recognized.
   */
  const identifyStyledBase = (
    baseExpr: any,
    localName: string,
  ): {
    baseInfo: StyledDecl["base"];
    styleKey: string;
  } | null => {
    if (
      baseExpr?.type === "MemberExpression" &&
      baseExpr.object?.type === "Identifier" &&
      baseExpr.object.name === styledDefaultImport &&
      baseExpr.property?.type === "Identifier"
    ) {
      return {
        baseInfo: { kind: "intrinsic", tagName: baseExpr.property.name },
        styleKey: toStyleKey(localName),
      };
    }

    if (
      baseExpr?.type === "CallExpression" &&
      baseExpr.callee?.type === "Identifier" &&
      baseExpr.callee.name === styledDefaultImport &&
      baseExpr.arguments?.length === 1
    ) {
      const arg = baseExpr.arguments[0];

      if (
        arg?.type === "StringLiteral" ||
        (arg?.type === "Literal" && typeof arg.value === "string")
      ) {
        return {
          baseInfo: { kind: "intrinsic", tagName: arg.value as string },
          styleKey: toStyleKey(localName),
        };
      }

      if (arg?.type === "Identifier") {
        return {
          baseInfo: { kind: "component", ident: arg.name },
          styleKey: toStyleKey(localName),
        };
      }

      if (arg?.type === "MemberExpression") {
        const ident = memberExprToIdent(arg);
        if (!ident) {
          return null;
        }
        return {
          baseInfo: { kind: "component", ident },
          styleKey: toStyleKey(localName),
        };
      }
    }

    return null;
  };

  // Collect: const X = styled.h1`...`;
  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    } as any)
    .forEach((p: any) => {
      const id = p.node.id;
      const init = p.node.init;
      if (!init || init.type !== "TaggedTemplateExpression") {
        return;
      }
      if (id.type !== "Identifier") {
        return;
      }
      const leadingComments = getLeadingComments(p);
      const placementHints = getPlacementHints(p);

      let { expr: tag, propsType } = unwrapTypeInstantiation(init.tag);
      if (!propsType) {
        propsType = readFirstTypeArgFromNode(init);
      }

      // Parse the styled template and push a simple styled decl (no attrs /
      // withConfig metadata) for the plain `styled.tag` / `styled("tag")` /
      // `styled(Component)` forms, which differ only in the `base` they target.
      const pushSimpleStyledDecl = (
        localName: string,
        base: StyledDecl["base"],
        styleKey: string = toStyleKey(localName),
      ): void => {
        const template = init.quasi;
        const templateLoc = getNodeLocStart(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        const hasUniversalSelector = noteUniversalSelectorIfPresent(template, parsed.rawCss, rules);

        styledDecls.push({
          ...placementHints,
          localName,
          base,
          styleKey,
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(hasUniversalSelector ? { hasUniversalSelector } : {}),
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
      };

      // styled.h1
      if (
        tag.type === "MemberExpression" &&
        tag.object.type === "Identifier" &&
        tag.object.name === styledDefaultImport &&
        tag.property.type === "Identifier"
      ) {
        pushSimpleStyledDecl(id.name, { kind: "intrinsic", tagName: tag.property.name });
        return;
      }

      // Unified handler: .attrs() and/or .withConfig() in any order and depth.
      {
        const peeled = peelChainMethods(tag);
        if (peeled != null) {
          const styledBase = identifyStyledBase(peeled.base, id.name);
          if (!styledBase) {
            return;
          }
          const localName = id.name;
          const template = init.quasi;
          const templateLoc = getNodeLocStart(template);
          const parsed = parseStyledTemplateLiteral(template);
          const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
            rawCss: parsed.rawCss,
          });
          const hasUniversalSelector = noteUniversalSelectorIfPresent(
            template,
            parsed.rawCss,
            rules,
          );

          const attrsInfo = peeled.attrsArg != null ? parseAttrsArg(peeled.attrsArg) : undefined;
          const sfpResult =
            peeled.withConfigArg != null ? parseShouldForwardProp(peeled.withConfigArg) : undefined;
          const shouldForwardProp = sfpResult?.parsed;
          const hasUnparseableShouldForwardProp = sfpResult?.unparseable;
          const withConfigMeta =
            peeled.withConfigArg != null ? parseWithConfigMeta(peeled.withConfigArg) : undefined;
          const finalPropsType = propsType ?? peeled.chainPropsType;

          styledDecls.push({
            ...placementHints,
            localName,
            base: styledBase.baseInfo,
            styleKey: styledBase.styleKey,
            rules,
            templateExpressions: parsed.slots.map((s) => s.expression),
            rawCss: parsed.rawCss,
            ...(hasUniversalSelector ? { hasUniversalSelector } : {}),
            ...(templateLoc ? { loc: templateLoc } : {}),
            ...(attrsInfo ? { attrsInfo } : {}),
            ...(shouldForceWrapperForAttrs(attrsInfo) ? { needsWrapperComponent: true } : {}),
            ...(shouldForwardProp ? { shouldForwardProp } : {}),
            ...(shouldForwardProp ? { shouldForwardPropFromWithConfig: true } : {}),
            ...(hasUnparseableShouldForwardProp ? { hasUnparseableShouldForwardProp } : {}),
            ...(withConfigMeta ? { withConfig: withConfigMeta } : {}),
            ...(finalPropsType ? { propsType: finalPropsType } : {}),
            ...(leadingComments ? { leadingComments } : {}),
          });
          return;
        }
      }

      // styled(Component) - where Component is an Identifier
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "Identifier" &&
        tag.callee.name === styledDefaultImport &&
        tag.arguments.length === 1 &&
        tag.arguments[0]?.type === "Identifier"
      ) {
        pushSimpleStyledDecl(id.name, { kind: "component", ident: tag.arguments[0].name });
      }

      // styled(Component.sub) - where Component is a MemberExpression (e.g., animated.div)
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "Identifier" &&
        tag.callee.name === styledDefaultImport &&
        tag.arguments.length === 1 &&
        tag.arguments[0]?.type === "MemberExpression"
      ) {
        const ident = memberExprToIdent(tag.arguments[0]);
        if (!ident) {
          return;
        }
        pushSimpleStyledDecl(id.name, { kind: "component", ident });
      }

      // styled("tagName") - intrinsic element with string argument (without chaining)
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "Identifier" &&
        tag.callee.name === styledDefaultImport &&
        tag.arguments.length === 1 &&
        (tag.arguments[0]?.type === "StringLiteral" ||
          (tag.arguments[0]?.type === "Literal" &&
            typeof (tag.arguments[0] as any).value === "string"))
      ) {
        const arg0 = tag.arguments[0] as any;
        pushSimpleStyledDecl(id.name, { kind: "intrinsic", tagName: arg0.value });
      }
    });

  // Collect: const X = styled.div({ ... }) / styled.div((props) => ({ ... }))
  root
    .find(j.VariableDeclarator, {
      init: { type: "CallExpression" },
    } as any)
    .forEach((p: any) => {
      if (!styledDefaultImport) {
        return;
      }
      const id = p.node.id;
      const init = p.node.init;
      if (id.type !== "Identifier") {
        return;
      }
      const leadingComments = getLeadingComments(p);
      const placementHints = getPlacementHints(p);
      if (!init || init.type !== "CallExpression") {
        return;
      }
      if (init.callee.type !== "MemberExpression") {
        return;
      }
      if (init.callee.object.type !== "Identifier") {
        return;
      }
      if (init.callee.object.name !== styledDefaultImport) {
        return;
      }
      if (init.callee.property.type !== "Identifier") {
        return;
      }

      const tagName = init.callee.property.name;
      // Extract type parameter: styled.div<{ ... }>(...) - may be on CallExpression or callee
      const propsType = readFirstTypeArgFromNode(init) ?? readFirstTypeArgFromNode(init.callee);
      const arg0 = init.arguments[0];
      if (!arg0) {
        return;
      }
      if (arg0.type !== "ObjectExpression" && arg0.type !== "ArrowFunctionExpression") {
        return;
      }

      const styleObj: Record<string, unknown> = {};
      const styleFnFromProps: Array<{ fnKey: string; jsxProp: string }> = [];
      const preResolvedFnDecls: Record<string, any> = {};
      let wantsDollarStrip = false;
      const fillFromObject = (obj: any) => {
        for (const prop of obj.properties ?? []) {
          if (!prop || prop.type !== "ObjectProperty") {
            continue;
          }
          const key =
            prop.key.type === "Identifier"
              ? prop.key.name
              : prop.key.type === "StringLiteral"
                ? prop.key.value
                : null;
          if (!key) {
            continue;
          }
          const v: any = prop.value;
          const styleKey =
            key === "background"
              ? v.type === "StringLiteral"
                ? resolveBackgroundStylexProp(v.value)
                : "backgroundColor"
              : key;
          if (v.type === "StringLiteral") {
            styleObj[styleKey] = v.value;
          } else if (v.type === "NumericLiteral") {
            styleObj[styleKey] = v.value;
          } else if (v.type === "BooleanLiteral") {
            styleObj[styleKey] = v.value;
          } else if (v.type === "NullLiteral") {
            styleObj[styleKey] = null;
          } else if (v.type === "LogicalExpression" && v.operator === "||") {
            // Prefer the fallback literal (matches common `props.x || "default"` patterns).
            const l: any = v.left;
            const r: any = v.right;
            const fallback =
              r.type === "StringLiteral" ? r.value : r.type === "NumericLiteral" ? r.value : null;
            const propName =
              l?.type === "MemberExpression" &&
              l.property?.type === "Identifier" &&
              l.property.name.startsWith("$")
                ? l.property.name
                : null;
            if (propName && fallback !== null) {
              wantsDollarStrip = true;
              styleObj[styleKey] = fallback;
              const fnKey = styleKeyWithSuffix(toStyleKey(id.name), styleKey);
              styleFnFromProps.push({ fnKey, jsxProp: propName });
              if (!preResolvedFnDecls[fnKey]) {
                const param = j.identifier(styleKey);
                (param as any).typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
                const p = j.property("init", j.identifier(styleKey), j.identifier(styleKey)) as any;
                p.shorthand = true;
                preResolvedFnDecls[fnKey] = j.arrowFunctionExpression(
                  [param],
                  j.objectExpression([p]),
                );
              }
            } else if (fallback !== null) {
              styleObj[styleKey] = fallback;
            } else {
              styleObj[styleKey] = "";
            }
          } else {
            styleObj[styleKey] = "";
          }
        }
      };

      // Helper to extract css template from arrow function body
      const extractCssTemplate = (body: any): any => {
        if (!body) {
          return null;
        }
        // Direct body: ({ $prop }) => css`...`
        if (
          body.type === "TaggedTemplateExpression" &&
          body.tag?.type === "Identifier" &&
          body.tag.name === cssLocal
        ) {
          return body.quasi;
        }
        // Block body: ({ $prop }) => { return css`...`; }
        if (body.type === "BlockStatement") {
          const ret = body.body.find((s: any) => s.type === "ReturnStatement") as any;
          if (
            ret?.argument?.type === "TaggedTemplateExpression" &&
            ret.argument.tag?.type === "Identifier" &&
            ret.argument.tag.name === cssLocal
          ) {
            return ret.argument.quasi;
          }
        }
        return null;
      };

      // Helper to extract destructured parameter names from arrow function
      const extractDestructuredParams = (arrowFn: any): Set<string> => {
        const params = new Set<string>();
        const param0 = arrowFn.params?.[0];
        if (param0?.type === "ObjectPattern") {
          for (const prop of param0.properties ?? []) {
            if (
              (prop.type === "Property" || prop.type === "ObjectProperty") &&
              prop.key?.type === "Identifier"
            ) {
              params.add(prop.key.name);
            }
          }
        } else if (param0?.type === "Identifier") {
          // Single identifier param like (props) => ... - not destructured
          // We'll use this name as the props param name
        }
        return params;
      };

      // Helper to get the props parameter name from arrow function
      const getPropsParamName = (arrowFn: any): string | null => {
        const param0 = arrowFn.params?.[0];
        if (param0?.type === "Identifier") {
          return param0.name;
        }
        return null;
      };

      // Helper to wrap an expression in an arrow function that takes props
      // and replaces references to destructured params with props.paramName
      const wrapExprInArrowFn = (
        expr: any,
        destructuredParams: Set<string>,
        originalPropsParam: string | null,
      ): any => {
        if (destructuredParams.size === 0 && !originalPropsParam) {
          // No params to transform, return as-is
          return expr;
        }

        // Deep clone the expression to avoid mutating the original
        const clonedExpr = cloneAstNode(expr);

        // Transform identifiers that match destructured params to props.identifier
        const transformNode = (node: any): void => {
          if (!node || typeof node !== "object") {
            return;
          }

          // Transform identifier references
          if (node.type === "Identifier" && destructuredParams.has(node.name)) {
            // Convert `$align` to a MemberExpression `props.$align`
            // We do this by changing the node in place
            const propName = node.name;
            node.type = "MemberExpression";
            node.object = { type: "Identifier", name: "props" };
            node.property = { type: "Identifier", name: propName };
            node.computed = false;
            delete node.name;
            return;
          }

          // Recurse into object properties
          for (const key of Object.keys(node)) {
            if (key === "type" || key === "loc" || key === "start" || key === "end") {
              continue;
            }
            const child = node[key];
            if (Array.isArray(child)) {
              for (const item of child) {
                transformNode(item);
              }
            } else if (child && typeof child === "object") {
              transformNode(child);
            }
          }
        };

        transformNode(clonedExpr);

        // Wrap in ArrowFunctionExpression
        return {
          type: "ArrowFunctionExpression",
          params: [{ type: "Identifier", name: "props" }],
          body: clonedExpr,
          expression: true,
        };
      };

      // Helper to wrap an expression in an arrow function for non-destructured params
      // e.g., (p) => css`${p.color}` -> wraps p.color in (props) => props.color
      const wrapExprInArrowFnWithPropsRename = (expr: any, propsParamName: string): any => {
        // Deep clone the expression to avoid mutating the original
        const clonedExpr = cloneAstNode(expr);

        // If the param name is not "props", rename references to it
        if (propsParamName !== "props") {
          const renameReferences = (node: any): void => {
            if (!node || typeof node !== "object") {
              return;
            }

            // Rename identifier references that match the old props param name
            if (node.type === "Identifier" && node.name === propsParamName) {
              node.name = "props";
              return;
            }

            // Recurse into object properties
            for (const key of Object.keys(node)) {
              if (key === "type" || key === "loc" || key === "start" || key === "end") {
                continue;
              }
              const child = node[key];
              if (Array.isArray(child)) {
                for (const item of child) {
                  renameReferences(item);
                }
              } else if (child && typeof child === "object") {
                renameReferences(child);
              }
            }
          };

          renameReferences(clonedExpr);
        }

        // Wrap in ArrowFunctionExpression
        return {
          type: "ArrowFunctionExpression",
          params: [{ type: "Identifier", name: "props" }],
          body: clonedExpr,
          expression: true,
        };
      };

      if (arg0.type === "ObjectExpression") {
        fillFromObject(arg0 as any);
      } else if (arg0.type === "ArrowFunctionExpression") {
        const body: any = arg0.body;
        const cssTemplate = cssLocal ? extractCssTemplate(body) : null;

        if (cssTemplate) {
          // Handle styled.div(props => css`...`) pattern
          const templateLoc = getNodeLocStart(cssTemplate);
          const parsed = parseStyledTemplateLiteral(cssTemplate);
          const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
            rawCss: parsed.rawCss,
          });
          const hasUniversalSelector = noteUniversalSelectorIfPresent(
            cssTemplate,
            parsed.rawCss,
            rules,
          );

          // Extract destructured params and transform expressions
          const destructuredParams = extractDestructuredParams(arg0);
          const propsParam = getPropsParamName(arg0);

          // Determine if we need to wrap expressions in ArrowFunctionExpressions
          // Case 1: Destructured params like ({$color}) => css`...${$color}...`
          //         -> Need to wrap and transform $color to props.$color
          // Case 2: Non-destructured param like (props) => css`...${props.color}...`
          //         -> Need to wrap but no transformation needed (already references props)
          const needsWrapping = destructuredParams.size > 0 || propsParam !== null;

          const transformedExpressions = parsed.slots.map((s) => {
            if (!needsWrapping) {
              return s.expression;
            }
            if (destructuredParams.size > 0) {
              // Destructured case: transform identifiers to props.identifier
              return wrapExprInArrowFn(s.expression, destructuredParams, propsParam);
            }
            // Non-destructured case: wrap in arrow fn, renaming param if needed
            // At this point propsParam is guaranteed non-null because needsWrapping is true
            // and destructuredParams.size is 0
            if (!propsParam) {
              return s.expression;
            }
            return wrapExprInArrowFnWithPropsRename(s.expression, propsParam);
          });

          styledDecls.push({
            ...placementHints,
            localName: id.name,
            base: { kind: "intrinsic", tagName },
            styleKey: toStyleKey(id.name),
            rules,
            templateExpressions: transformedExpressions,
            rawCss: parsed.rawCss,
            ...(hasUniversalSelector ? { hasUniversalSelector } : {}),
            ...(templateLoc ? { loc: templateLoc } : {}),
            ...(propsType ? { propsType } : {}),
            ...(leadingComments ? { leadingComments } : {}),
          });
          return;
        } else if (body?.type === "ObjectExpression") {
          fillFromObject(body);
        } else if (body?.type === "BlockStatement") {
          const ret = body.body.find((s: any) => s.type === "ReturnStatement") as any;
          if (ret?.argument?.type === "ObjectExpression") {
            fillFromObject(ret.argument);
          }
        }
      }

      styledDecls.push({
        ...placementHints,
        localName: id.name,
        base: { kind: "intrinsic", tagName },
        styleKey: toStyleKey(id.name),
        rules: [],
        templateExpressions: [],
        preResolvedStyle: styleObj,
        ...(propsType ? { propsType } : {}),
        ...(Object.keys(preResolvedFnDecls).length ? { preResolvedFnDecls } : {}),
        ...(styleFnFromProps.length ? { styleFnFromProps } : {}),
        ...(wantsDollarStrip
          ? {
              shouldForwardProp: {
                // For styled-object transient props we know exactly which `$...` keys we read.
                dropProps: [...new Set(styleFnFromProps.map((p) => p.jsxProp))],
              },
              needsWrapperComponent: true,
            }
          : {}),
        ...(leadingComments ? { leadingComments } : {}),
      });
    });

  applyStyledPrefixStripping(styledDecls);

  return { styledDecls, hasUniversalSelectors, universalSelectorLoc };
}

/**
 * Post-processing step: strip the "styled"/"Styled" prefix from style keys
 * when the component name follows the `styledX` / `StyledX` convention
 * and stripping would NOT collide with another declaration's key.
 *
 * Also updates derived keys (styleFnFromProps fnKeys) to stay consistent.
 */
function applyStyledPrefixStripping(styledDecls: StyledDecl[]): void {
  const usedKeys = new Set(styledDecls.map((d) => d.styleKey));

  for (const decl of styledDecls) {
    const stripped = stripStyledPrefix(decl.localName);
    if (stripped === decl.localName) {
      continue;
    }
    const strippedKey = toStyleKey(stripped);
    if (usedKeys.has(strippedKey)) {
      continue;
    }
    const oldKey = decl.styleKey;
    usedKeys.delete(oldKey);
    usedKeys.add(strippedKey);
    decl.styleKey = strippedKey;

    if (decl.styleFnFromProps) {
      for (const entry of decl.styleFnFromProps) {
        if (entry.fnKey.startsWith(oldKey)) {
          entry.fnKey = strippedKey + entry.fnKey.slice(oldKey.length);
        }
      }
    }
  }
}

/**
 * Extracts CSS style properties from an `attrs({ style: { ... } })` object.
 *
 * Handles these patterns:
 * - Static values: `style: { whiteSpace: "nowrap" }` → stored in `attrsStaticStyles`
 * - Dynamic ternary: `style: { height: $prop ? expr : undefined }` → stored in `attrsDynamicStyles`
 * - Direct prop reads: `style: { height: props.height }` → stored in `attrsDynamicStyles`
 *
 * Returns true if all properties were handled, false if any property is unsupported.
 */
function tryExtractStyleObject(
  styleObj: { properties?: unknown[] },
  out: {
    attrsStaticStyles?: Record<string, unknown>;
    attrsDynamicStyles?: Array<{
      cssProp: string;
      jsxProp: string;
      callArgExpr: unknown;
      condition?: "truthy" | "always";
    }>;
  },
  attrsParamPropNames: ReadonlySet<string>,
  resolveModuleScopeStaticValue: (name: string) => string | number | undefined,
): boolean {
  const staticStyles: Record<string, unknown> = {};
  const dynamicStyles: Array<{
    cssProp: string;
    jsxProp: string;
    callArgExpr: unknown;
    condition?: "truthy" | "always";
  }> = [];

  for (const prop of styleObj.properties ?? []) {
    const p = prop as { type?: string; key?: any; value?: any };
    if (!p || (p.type !== "ObjectProperty" && p.type !== "Property")) {
      return false;
    }
    const cssProp = p.key?.type === "Identifier" ? (p.key.name as string) : null;
    if (!cssProp) {
      return false;
    }

    const v = p.value;
    // Static string literal (including `as const`)
    if (v?.type === "StringLiteral" || v?.type === "NumericLiteral") {
      staticStyles[cssProp] = v.value;
      continue;
    }
    // TSAsExpression wrapping a literal: `"nowrap" as const`
    if (v?.type === "TSAsExpression" && v.expression?.type === "StringLiteral") {
      staticStyles[cssProp] = v.expression.value;
      continue;
    }

    // Dynamic ternary: `$prop ? expr : undefined`
    if (v?.type === "ConditionalExpression") {
      const jsxProp = extractTernaryJsxProp(v, attrsParamPropNames);
      if (jsxProp) {
        dynamicStyles.push({
          cssProp,
          jsxProp,
          callArgExpr: isUndefinedNode(v.alternate) ? v.consequent : v,
          condition: isUndefinedNode(v.alternate) ? "truthy" : "always",
        });
        continue;
      }
    }

    const directDynamic = extractDynamicStyleValue(v, attrsParamPropNames);
    if (directDynamic) {
      dynamicStyles.push({ cssProp, ...directDynamic });
      continue;
    }

    if (
      v?.type === "Identifier" &&
      typeof v.name === "string" &&
      !attrsParamPropNames.has(v.name)
    ) {
      const staticValue = resolveModuleScopeStaticValue(v.name);
      if (staticValue !== undefined) {
        staticStyles[cssProp] = staticValue;
        continue;
      }
    }

    return false;
  }

  if (Object.keys(staticStyles).length > 0) {
    out.attrsStaticStyles = staticStyles;
  }
  if (dynamicStyles.length > 0) {
    out.attrsDynamicStyles = dynamicStyles;
  }
  return true;
}

/**
 * Extracts the JSX prop name from a ternary test expression.
 * Handles:
 * - Bare identifier (destructured param): `$height` → "$height"
 * - Member access: `props.$height` → "$height"
 */
function extractTernaryJsxProp(
  ternary: { test?: any },
  attrsParamPropNames: ReadonlySet<string>,
): string | null {
  const test = ternary.test;
  if (!test) {
    return null;
  }
  // Bare identifier from destructured param: ({ $height }) => $height ? ...
  if (
    test.type === "Identifier" &&
    typeof test.name === "string" &&
    attrsParamPropNames.has(test.name)
  ) {
    return test.name;
  }
  // Member expression: (props) => props.$height ? ...
  if (
    test.type === "MemberExpression" &&
    test.property?.type === "Identifier" &&
    typeof test.property.name === "string"
  ) {
    return test.property.name;
  }
  return null;
}

function extractDynamicStyleValue(
  value: any,
  attrsParamPropNames: ReadonlySet<string>,
): { jsxProp: string; callArgExpr: unknown; condition?: "always" } | null {
  const attrsParamInfo = {
    propNames: attrsParamPropNames,
    propByLocalName: new Map<string, string>(),
    defaultsByPropName: new Map<string, unknown>(),
    rootNames: new Set(["props", "p"]),
    localNames: new Set<string>(),
  };
  const propName = extractPropName(value, attrsParamInfo);
  if (propName) {
    return { jsxProp: propName, callArgExpr: identifierNode(propName) };
  }

  if (
    (value?.type === "LogicalExpression" && value.operator === "??") ||
    value?.type === "TSNullishCoalescingExpression"
  ) {
    const leftPropName = extractPropName(value.left, attrsParamInfo);
    if (leftPropName) {
      return {
        jsxProp: leftPropName,
        callArgExpr: {
          ...value,
          left: identifierNode(leftPropName),
        },
        condition: "always",
      };
    }
  }

  return null;
}

function shouldDropStyledLeadingComment(comment: unknown): boolean {
  const body = getCommentBody(comment);
  return (
    hasLeadingFalse(comment) || isPrettierIgnoreComment(body) || isStyleSectionMarkerComment(body)
  );
}

function hasLeadingFalse(comment: unknown): boolean {
  if (!comment || typeof comment !== "object") {
    return false;
  }
  return (comment as { leading?: unknown }).leading === false;
}

type AttrsParamInfo = {
  propNames: ReadonlySet<string>;
  propByLocalName: ReadonlyMap<string, string>;
  defaultsByPropName: ReadonlyMap<string, unknown>;
  rootNames: ReadonlySet<string>;
  localNames: ReadonlySet<string>;
};

function emptyAttrsParamInfo(): AttrsParamInfo {
  return {
    propNames: new Set(),
    propByLocalName: new Map(),
    defaultsByPropName: new Map(),
    rootNames: new Set(),
    localNames: new Set(),
  };
}

/**
 * True when `prop` is a spread of the attrs callback's props parameter
 * (e.g. `({ ...props }) => ({ ...props, role: "x" })`). Such a spread merely
 * re-forwards props the wrapper already passes through, so it can be dropped.
 */
function isPropsParamSpread(prop: any, attrsParamInfo: AttrsParamInfo): boolean {
  if (prop?.type !== "SpreadElement" && prop?.type !== "SpreadProperty") {
    return false;
  }
  const arg = prop.argument;
  return arg?.type === "Identifier" && attrsParamInfo.rootNames.has(arg.name);
}

function extractPropName(value: any, attrsParamInfo: AttrsParamInfo): string | null {
  if (
    value?.type === "Identifier" &&
    typeof value.name === "string" &&
    attrsParamInfo.propNames.has(value.name)
  ) {
    return attrsParamInfo.propByLocalName.get(value.name) ?? value.name;
  }
  if (
    value?.type === "MemberExpression" &&
    value.object?.type === "Identifier" &&
    attrsParamInfo.rootNames.has(value.object.name) &&
    value.property?.type === "Identifier" &&
    typeof value.property.name === "string"
  ) {
    return value.property.name;
  }
  return null;
}

function extractPropDefault(value: any, attrsParamInfo: AttrsParamInfo): unknown {
  const propName = extractPropName(value, attrsParamInfo);
  return propName ? attrsParamInfo.defaultsByPropName.get(propName) : undefined;
}

function getAttrsParamInfo(params: any[] | undefined): AttrsParamInfo {
  const names = new Set<string>();
  const propByLocalName = new Map<string, string>();
  const defaultsByPropName = new Map<string, unknown>();
  const rootNames = new Set<string>();
  const localNames = new Set<string>();
  const firstParamRaw = params?.[0];
  const firstParam =
    firstParamRaw?.type === "AssignmentPattern" ? firstParamRaw.left : firstParamRaw;
  if (firstParam?.type === "Identifier" && typeof firstParam.name === "string") {
    rootNames.add(firstParam.name);
    return { propNames: names, propByLocalName, defaultsByPropName, rootNames, localNames };
  }
  if (firstParam?.type !== "ObjectPattern") {
    return { propNames: names, propByLocalName, defaultsByPropName, rootNames, localNames };
  }

  for (const prop of firstParam.properties ?? []) {
    if (!prop) {
      continue;
    }
    if (prop.type === "RestElement") {
      if (prop.argument?.type === "Identifier" && typeof prop.argument.name === "string") {
        if ((firstParam.properties ?? []).length === 1) {
          rootNames.add(prop.argument.name);
        } else {
          localNames.add(prop.argument.name);
        }
      }
      continue;
    }
    const propName =
      prop.key?.type === "Identifier"
        ? prop.key.name
        : prop.key?.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (!propName) {
      continue;
    }
    const value = prop.value ?? prop.argument;
    if (!isValidIdentifierName(propName)) {
      collectPatternNames(value, localNames);
      continue;
    }
    if (value?.type === "Identifier" && typeof value.name === "string") {
      names.add(value.name);
      propByLocalName.set(value.name, propName);
      continue;
    }
    if (
      value?.type === "AssignmentPattern" &&
      value.left?.type === "Identifier" &&
      typeof value.left.name === "string"
    ) {
      names.add(value.left.name);
      propByLocalName.set(value.left.name, propName);
      const defaultValue = literalStaticValueFromNode(value.right);
      if (defaultValue !== undefined) {
        defaultsByPropName.set(propName, defaultValue);
      }
      continue;
    }
    // Nested destructuring (e.g. `motion: { duration }`) binds callback-local
    // names that are not module-scope references. Collect them so attrs values
    // referencing them are not misclassified as static and hoisted/inlined with
    // the wrong binding.
    collectPatternNames(value, localNames);
  }

  return { propNames: names, propByLocalName, defaultsByPropName, rootNames, localNames };
}

function literalStaticValueFromNode(node: unknown): string | number | boolean | null | undefined {
  return extractStaticLiteralValue(node, { allowCssTaggedTemplates: false });
}

function isStaticAttrExpression(node: any, attrsParamInfo: AttrsParamInfo): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    return isStaticAttrExpression(node.expression, attrsParamInfo);
  }
  const rootName = getStaticAttrExpressionRootName(node);
  return (
    rootName != null &&
    !attrsParamInfo.propNames.has(rootName) &&
    !attrsParamInfo.rootNames.has(rootName) &&
    !attrsParamInfo.localNames.has(rootName)
  );
}

/**
 * Returns true when `node` is a value expression that can be hoisted verbatim
 * into the rendered JSX as an attribute value. This covers primitive literals,
 * static references (module-scope identifiers/members), and object/array
 * literals composed only of such hoistable parts. None of these reference the
 * attrs callback's props, so styled-components and the inlined JSX attribute
 * resolve them to the same value — making the hoist lossless.
 */
function isStaticValueExpression(node: any, attrsParamInfo: AttrsParamInfo): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    return isStaticValueExpression(node.expression, attrsParamInfo);
  }
  // Primitive literals (strings, numbers, booleans, null, unary numbers, static templates, ...).
  if (literalStaticValueFromNode(node) !== undefined) {
    return true;
  }
  // Module-scope identifier / member references (e.g. an imported component).
  if (isStaticAttrExpression(node, attrsParamInfo)) {
    return true;
  }
  if (node.type === "ArrayExpression") {
    return (node.elements ?? []).every(
      (el: any) =>
        // Array holes (`[,]`) are represented as null elements.
        el == null ||
        (el.type !== "SpreadElement" &&
          el.type !== "RestElement" &&
          isStaticValueExpression(el, attrsParamInfo)),
    );
  }
  if (node.type === "ObjectExpression") {
    return (node.properties ?? []).every((prop: any) => {
      if (!prop || (prop.type !== "ObjectProperty" && prop.type !== "Property")) {
        // Spread elements, getters/setters, etc. are not safely hoistable.
        return false;
      }
      // Computed keys could reference props; only accept statically-named keys.
      if (prop.computed) {
        return false;
      }
      return isStaticValueExpression(prop.value, attrsParamInfo);
    });
  }
  return false;
}

function getStaticAttrExpressionRootName(node: any): string | null {
  if (node?.type === "Identifier" && node.name !== "undefined") {
    return node.name;
  }
  if (node?.type !== "MemberExpression" || node.computed) {
    return null;
  }
  if (node.property?.type !== "Identifier" && node.property?.type !== "PrivateName") {
    return null;
  }
  return getStaticAttrExpressionRootName(node.object);
}

function staticAttrExpressionToReference(node: any, attrsParamInfo: AttrsParamInfo): string | null {
  if (!isStaticAttrExpression(node, attrsParamInfo)) {
    return null;
  }
  if (node?.type === "TSAsExpression" || node?.type === "TSSatisfiesExpression") {
    return staticAttrExpressionToReference(node.expression, attrsParamInfo);
  }
  if (node?.type === "Identifier" && node.name !== "undefined") {
    return node.name;
  }
  if (node?.type === "MemberExpression" && !node.computed) {
    const objectRef = staticAttrExpressionToReference(node.object, attrsParamInfo);
    if (objectRef && node.property?.type === "Identifier") {
      return `${objectRef}.${node.property.name}`;
    }
  }
  return null;
}

function collectBlockLocalNames(block: any): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of block.body ?? []) {
    if (stmt?.type === "FunctionDeclaration" || stmt?.type === "ClassDeclaration") {
      if (stmt.id?.type === "Identifier") {
        names.add(stmt.id.name);
      }
      continue;
    }
    if (stmt?.type !== "VariableDeclaration") {
      continue;
    }
    for (const decl of stmt.declarations ?? []) {
      collectPatternNames(decl?.id, names);
    }
  }
  return names;
}

function collectPatternNames(pattern: any, names: Set<string>): void {
  if (!pattern) {
    return;
  }
  if (pattern.type === "Identifier") {
    names.add(pattern.name);
    return;
  }
  if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties ?? []) {
      collectPatternNames(prop?.value ?? prop?.argument, names);
    }
    return;
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements ?? []) {
      collectPatternNames(element, names);
    }
    return;
  }
  if (pattern.type === "AssignmentPattern" || pattern.type === "RestElement") {
    collectPatternNames(pattern.left ?? pattern.argument, names);
  }
}

function identifierNode(name: string): unknown {
  return { type: "Identifier", name };
}

/** Checks if a node represents `undefined`. */
function isUndefinedNode(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; name?: string };
  return n.type === "Identifier" && n.name === "undefined";
}
