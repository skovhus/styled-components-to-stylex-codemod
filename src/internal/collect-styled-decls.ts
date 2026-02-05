import type { Collection } from "jscodeshift";
import {
  computeUniversalSelectorLoc,
  hasUniversalSelectorInRules,
  normalizeStylisAstToIR,
} from "./css-ir.js";
import { cloneAstNode, getFunctionBodyExpr } from "./utilities/jscodeshift-utils.js";
import { resolveBackgroundStylexProp } from "./css-prop-mapping.js";
import { parseStyledTemplateLiteral } from "./styled-css.js";
import type { StyledDecl } from "./transform-types.js";
import { toStyleKey, toSuffixFromProp } from "./transform/helpers.js";

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

  const getTemplateLoc = (template: any): { line: number; column: number } | null => {
    const start = template?.loc?.start;
    if (start?.line === undefined) {
      return null;
    }
    return { line: start.line, column: start.column ?? 0 };
  };

  const noteUniversalSelector = (template: any, rawCss: string): void => {
    hasUniversalSelectors = true;
    if (universalSelectorLoc) {
      return;
    }
    universalSelectorLoc = computeUniversalSelectorLoc(getTemplateLoc(template), rawCss);
  };

  const parseAttrsArg = (arg0: any): StyledDecl["attrsInfo"] | undefined => {
    if (!arg0) {
      return undefined;
    }
    // Use Required to narrow the type since we're initializing all fields
    const out: Required<NonNullable<StyledDecl["attrsInfo"]>> = {
      staticAttrs: {},
      defaultAttrs: [],
      conditionalAttrs: [],
      invertedBoolAttrs: [],
    };

    const fillFromObject = (obj: any) => {
      for (const prop of obj.properties ?? []) {
        if (!prop || (prop.type !== "ObjectProperty" && prop.type !== "Property")) {
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
        if (
          v.type === "StringLiteral" ||
          v.type === "NumericLiteral" ||
          v.type === "BooleanLiteral"
        ) {
          out.staticAttrs[key] = v.value;
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
          if (
            left?.type === "MemberExpression" &&
            left.object?.type === "Identifier" &&
            (left.object.name === "props" || left.object.name === "p") &&
            left.property?.type === "Identifier" &&
            (right?.type === "StringLiteral" ||
              right?.type === "NumericLiteral" ||
              right?.type === "BooleanLiteral")
          ) {
            out.defaultAttrs.push({
              jsxProp: left.property.name,
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
      }
    };

    if (arg0.type === "ObjectExpression") {
      fillFromObject(arg0);
      return out;
    }

    if (arg0.type === "ArrowFunctionExpression") {
      const body = arg0.body as any;
      if (body?.type === "ObjectExpression") {
        fillFromObject(body);
        return out;
      }
      if (body?.type === "BlockStatement") {
        const ret = body.body.find((s: any) => s.type === "ReturnStatement") as any;
        if (ret?.argument?.type === "ObjectExpression") {
          fillFromObject(ret.argument);
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

      // !["a","b"].includes(prop)
      if (expr.type === "UnaryExpression" && expr.operator === "!") {
        const inner = expr.argument;
        if (
          inner?.type === "CallExpression" &&
          inner.callee?.type === "MemberExpression" &&
          inner.callee.property?.type === "Identifier" &&
          inner.callee.property.name === "includes" &&
          inner.callee.object?.type === "ArrayExpression" &&
          inner.arguments?.[0]?.type === "Identifier" &&
          inner.arguments[0].name === paramName
        ) {
          for (const el of inner.callee.object.elements ?? []) {
            if (el?.type === "Literal" && typeof el.value === "string") {
              dropProps.add(el.value);
            }
            if (el?.type === "StringLiteral") {
              dropProps.add(el.value);
            }
          }
          return;
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

    // If we consumed type params from a direct attachment, strip them from the expr so downstream
    // tag/callee matching is stable.
    if (cur && (cur.typeParameters || cur.typeArguments)) {
      try {
        delete cur.typeParameters;
        delete cur.typeArguments;
      } catch {
        // ignore (non-extensible nodes)
      }
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
   * Extract leading comments from the parent VariableDeclaration if it has a single declarator.
   * This captures JSDoc and line comments for preservation in the output.
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
    // Only capture leading comments
    return comments.filter((c: any) => c.leading !== false);
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
    const varDeclPath = declaratorPath?.parentPath;
    if (!varDeclPath || varDeclPath.node?.type !== "VariableDeclaration") {
      return {};
    }
    const programBody = (root.get().node.program as any)?.body;
    if (!Array.isArray(programBody)) {
      return {};
    }
    const idx = (() => {
      const direct = programBody.indexOf(varDeclPath.node);
      if (direct >= 0) {
        return direct;
      }
      const loc = (varDeclPath.node as any)?.loc?.start;
      if (!loc) {
        return -1;
      }
      return programBody.findIndex((s: any) => {
        const sloc = s?.loc?.start;
        return sloc && sloc.line === loc.line && sloc.column === loc.column;
      });
    })();
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
        if (propsType) {
          try {
            delete (init as any).typeParameters;
            delete (init as any).typeArguments;
          } catch {
            // ignore
          }
        }
      }
      // styled.h1
      if (
        tag.type === "MemberExpression" &&
        tag.object.type === "Identifier" &&
        tag.object.name === styledDefaultImport &&
        tag.property.type === "Identifier"
      ) {
        const localName = id.name;
        const tagName = tag.property.name;
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
        return;
      }

      // styled.h1.attrs(... )`...` or styled.h1.withConfig(... )`...`
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "MemberExpression" &&
        tag.callee.property.type === "Identifier" &&
        (tag.callee.property.name === "attrs" || tag.callee.property.name === "withConfig") &&
        tag.callee.object.type === "MemberExpression" &&
        tag.callee.object.object.type === "Identifier" &&
        tag.callee.object.object.name === styledDefaultImport &&
        tag.callee.object.property.type === "Identifier"
      ) {
        const localName = id.name;
        const tagName = tag.callee.object.property.name;
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }
        const attrsInfo =
          tag.callee.property.name === "attrs" ? parseAttrsArg(tag.arguments[0]) : undefined;
        const sfpResult =
          tag.callee.property.name === "withConfig"
            ? parseShouldForwardProp(tag.arguments[0])
            : undefined;
        const shouldForwardProp = sfpResult?.parsed;
        const hasUnparseableShouldForwardProp = sfpResult?.unparseable;
        const withConfigMeta =
          tag.callee.property.name === "withConfig"
            ? parseWithConfigMeta(tag.arguments[0])
            : undefined;

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(attrsInfo ? { attrsInfo } : {}),
          ...(shouldForceWrapperForAttrs(attrsInfo) ? { needsWrapperComponent: true } : {}),
          ...(shouldForwardProp ? { shouldForwardProp } : {}),
          ...(shouldForwardProp ? { shouldForwardPropFromWithConfig: true } : {}),
          ...(hasUnparseableShouldForwardProp ? { hasUnparseableShouldForwardProp } : {}),
          ...(withConfigMeta ? { withConfig: withConfigMeta } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
        return;
      }

      // styled("tagName").attrs(... )`...` - function call syntax with string argument + attrs
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "MemberExpression" &&
        tag.callee.property.type === "Identifier" &&
        tag.callee.property.name === "attrs" &&
        tag.callee.object.type === "CallExpression" &&
        tag.callee.object.callee.type === "Identifier" &&
        tag.callee.object.callee.name === styledDefaultImport &&
        tag.callee.object.arguments.length === 1 &&
        (tag.callee.object.arguments[0]?.type === "StringLiteral" ||
          (tag.callee.object.arguments[0]?.type === "Literal" &&
            typeof (tag.callee.object.arguments[0] as any).value === "string"))
      ) {
        const localName = id.name;
        const arg0 = tag.callee.object.arguments[0] as any;
        const tagName = arg0.type === "StringLiteral" ? arg0.value : arg0.value;
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }
        const attrsInfo = parseAttrsArg(tag.arguments[0]);

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(attrsInfo ? { attrsInfo } : {}),
          ...(shouldForceWrapperForAttrs(attrsInfo) ? { needsWrapperComponent: true } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
        return;
      }

      // styled(Component).attrs(...)`...` - component with attrs
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "MemberExpression" &&
        tag.callee.property.type === "Identifier" &&
        tag.callee.property.name === "attrs" &&
        tag.callee.object.type === "CallExpression" &&
        tag.callee.object.callee.type === "Identifier" &&
        tag.callee.object.callee.name === styledDefaultImport &&
        tag.callee.object.arguments.length === 1 &&
        tag.callee.object.arguments[0]?.type === "Identifier"
      ) {
        const localName = id.name;
        const ident = tag.callee.object.arguments[0].name;
        const styleKey = localName === `Styled${ident}` ? toStyleKey(ident) : toStyleKey(localName);
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }
        const attrsInfo = parseAttrsArg(tag.arguments[0]);

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "component", ident },
          styleKey,
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(attrsInfo ? { attrsInfo } : {}),
          ...(shouldForceWrapperForAttrs(attrsInfo) ? { needsWrapperComponent: true } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
        return;
      }

      // styled(Component) - where Component is an Identifier
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "Identifier" &&
        tag.callee.name === styledDefaultImport &&
        tag.arguments.length === 1 &&
        tag.arguments[0]?.type === "Identifier"
      ) {
        const localName = id.name;
        const ident = tag.arguments[0].name;
        const styleKey = localName === `Styled${ident}` ? toStyleKey(ident) : toStyleKey(localName);
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "component", ident },
          styleKey,
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
      }

      // styled(Component.sub) - where Component is a MemberExpression (e.g., animated.div)
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "Identifier" &&
        tag.callee.name === styledDefaultImport &&
        tag.arguments.length === 1 &&
        tag.arguments[0]?.type === "MemberExpression"
      ) {
        const localName = id.name;
        const memberExpr = tag.arguments[0] as any;
        // Convert MemberExpression to string like "animated.div"
        const ident =
          memberExpr.object?.type === "Identifier" && memberExpr.property?.type === "Identifier"
            ? `${memberExpr.object.name}.${memberExpr.property.name}`
            : null;
        if (!ident) {
          return;
        }
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "component", ident },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
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
        const localName = id.name;
        const arg0 = tag.arguments[0] as any;
        const tagName = arg0.type === "StringLiteral" ? arg0.value : arg0.value;
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
      }

      // styled(Base).withConfig(...)`...`
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "MemberExpression" &&
        tag.callee.property.type === "Identifier" &&
        tag.callee.property.name === "withConfig" &&
        tag.callee.object.type === "CallExpression" &&
        tag.callee.object.callee.type === "Identifier" &&
        tag.callee.object.callee.name === styledDefaultImport &&
        tag.callee.object.arguments.length === 1 &&
        tag.callee.object.arguments[0]?.type === "Identifier"
      ) {
        const localName = id.name;
        const ident = tag.callee.object.arguments[0].name;
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }
        const sfpResult = parseShouldForwardProp(tag.arguments[0]);
        const shouldForwardProp = sfpResult?.parsed;
        const hasUnparseableShouldForwardProp = sfpResult?.unparseable;
        const withConfigMeta = parseWithConfigMeta(tag.arguments[0]);

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "component", ident },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(shouldForwardProp ? { shouldForwardProp } : {}),
          ...(shouldForwardProp ? { shouldForwardPropFromWithConfig: true } : {}),
          ...(hasUnparseableShouldForwardProp ? { hasUnparseableShouldForwardProp } : {}),
          ...(withConfigMeta ? { withConfig: withConfigMeta } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
      }

      // styled("div").withConfig(...)`...` - intrinsic element with string argument
      if (
        tag.type === "CallExpression" &&
        tag.callee.type === "MemberExpression" &&
        tag.callee.property.type === "Identifier" &&
        tag.callee.property.name === "withConfig" &&
        tag.callee.object.type === "CallExpression" &&
        tag.callee.object.callee.type === "Identifier" &&
        tag.callee.object.callee.name === styledDefaultImport &&
        tag.callee.object.arguments.length === 1 &&
        (tag.callee.object.arguments[0]?.type === "StringLiteral" ||
          (tag.callee.object.arguments[0]?.type === "Literal" &&
            typeof (tag.callee.object.arguments[0] as any).value === "string"))
      ) {
        const localName = id.name;
        const arg0 = tag.callee.object.arguments[0] as any;
        const tagName = arg0.type === "StringLiteral" ? arg0.value : arg0.value;
        const template = init.quasi;
        const templateLoc = getTemplateLoc(template);
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
          rawCss: parsed.rawCss,
        });
        if (hasUniversalSelectorInRules(rules)) {
          noteUniversalSelector(template, parsed.rawCss);
        }
        const sfpResult = parseShouldForwardProp(tag.arguments[0]);
        const shouldForwardProp = sfpResult?.parsed;
        const hasUnparseableShouldForwardProp = sfpResult?.unparseable;
        const withConfigMeta = parseWithConfigMeta(tag.arguments[0]);

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(templateLoc ? { loc: templateLoc } : {}),
          ...(shouldForwardProp ? { shouldForwardProp } : {}),
          ...(shouldForwardProp ? { shouldForwardPropFromWithConfig: true } : {}),
          ...(hasUnparseableShouldForwardProp ? { hasUnparseableShouldForwardProp } : {}),
          ...(withConfigMeta ? { withConfig: withConfigMeta } : {}),
          ...(propsType ? { propsType } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
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
              const fnKey = `${toStyleKey(id.name)}${toSuffixFromProp(styleKey)}`;
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
          const templateLoc = getTemplateLoc(cssTemplate);
          const parsed = parseStyledTemplateLiteral(cssTemplate);
          const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots, {
            rawCss: parsed.rawCss,
          });
          if (hasUniversalSelectorInRules(rules)) {
            noteUniversalSelector(cssTemplate, parsed.rawCss);
          }

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

  return { styledDecls, hasUniversalSelectors, universalSelectorLoc };
}
