import type { Collection } from "jscodeshift";
import type { CssRuleIR } from "./css-ir.js";
import { normalizeStylisAstToIR } from "./css-ir.js";
import { parseStyledTemplateLiteral } from "./styled-css.js";
import type { StyledDecl } from "./transform-types.js";

function hasUniversalSelectorInRules(rules: CssRuleIR[]): boolean {
  // Rule selectors come from Stylis output (not from JS), so a literal `*` here
  // always indicates a CSS universal selector (descendant/direct-child/etc).
  // We currently treat ANY universal selector usage as unsupported and skip the file.
  return rules.some((r) => typeof r.selector === "string" && r.selector.includes("*"));
}

/**
 * Collect styled component declarations and pre-resolved object-style decls.
 *
 * This module is intentionally “dumb”: it only *collects* declarations and metadata.
 * It does not emit styles or rewrite JSX.
 */
export function collectStyledDecls(args: {
  root: Collection<any>;
  j: any;
  styledDefaultImport: string | undefined;
  toStyleKey: (localName: string) => string;
  toSuffixFromProp: (propName: string) => string;
}): { styledDecls: StyledDecl[]; hasUniversalSelectors: boolean } {
  const { root, j, styledDefaultImport, toStyleKey, toSuffixFromProp } = args;

  const styledDecls: StyledDecl[] = [];
  let hasUniversalSelectors = false;

  const parseAttrsArg = (arg0: any): StyledDecl["attrsInfo"] | undefined => {
    if (!arg0) {
      return undefined;
    }
    const out: StyledDecl["attrsInfo"] = {
      staticAttrs: {},
      conditionalAttrs: [],
    };

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

        const v = prop.value as any;
        if (
          v.type === "StringLiteral" ||
          v.type === "NumericLiteral" ||
          v.type === "BooleanLiteral"
        ) {
          out.staticAttrs[key] = v.value;
          continue;
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

  const parseShouldForwardProp = (arg0: any): StyledDecl["shouldForwardProp"] | undefined => {
    if (!arg0 || arg0.type !== "ObjectExpression") {
      return undefined;
    }
    const prop = (arg0.properties ?? []).find((p: any) => {
      if (!p || p.type !== "ObjectProperty") {
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
      return undefined;
    }
    const paramName = fn.params?.[0]?.type === "Identifier" ? fn.params[0].name : null;
    if (!paramName) {
      return undefined;
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

    const body =
      fn.body?.type === "BlockStatement"
        ? fn.body.body.find((s: any) => s.type === "ReturnStatement")?.argument
        : fn.body;
    collect(body);

    const dropPropsArr = [...dropProps];
    if (!dropPropsArr.length && !dropPrefix) {
      return undefined;
    }
    return {
      dropProps: dropPropsArr,
      ...(dropPrefix ? { dropPrefix } : {}),
    };
  };

  const parseWithConfigMeta = (arg0: any): StyledDecl["withConfig"] | undefined => {
    if (!arg0 || arg0.type !== "ObjectExpression") {
      return undefined;
    }
    let displayName: string | undefined;
    let componentId: string | undefined;
    for (const p of arg0.properties ?? []) {
      if (!p || p.type !== "ObjectProperty") {
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
      if (key === "displayName") {
        displayName = val;
      }
      if (key === "componentId") {
        componentId = val;
      }
    }
    if (!displayName && !componentId) {
      return undefined;
    }
    return {
      ...(displayName ? { displayName } : {}),
      ...(componentId ? { componentId } : {}),
    };
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
    const comments = parentPath.node.comments ?? parentPath.node.leadingComments;
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

      const tag = init.tag;
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
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);
        if (hasUniversalSelectorInRules(rules)) {
          hasUniversalSelectors = true;
        }

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "intrinsic", tagName },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
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
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);
        if (hasUniversalSelectorInRules(rules)) {
          hasUniversalSelectors = true;
        }
        const attrsInfo =
          tag.callee.property.name === "attrs" ? parseAttrsArg(tag.arguments[0]) : undefined;
        const shouldForwardProp =
          tag.callee.property.name === "withConfig"
            ? parseShouldForwardProp(tag.arguments[0])
            : undefined;
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
          ...(attrsInfo ? { attrsInfo } : {}),
          ...(shouldForwardProp ? { shouldForwardProp } : {}),
          ...(withConfigMeta ? { withConfig: withConfigMeta } : {}),
          ...(leadingComments ? { leadingComments } : {}),
        });
        return;
      }

      // styled(Component)
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
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);
        if (hasUniversalSelectorInRules(rules)) {
          hasUniversalSelectors = true;
        }

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "component", ident },
          styleKey,
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
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
        const parsed = parseStyledTemplateLiteral(template);
        const rules = normalizeStylisAstToIR(parsed.stylisAst, parsed.slots);
        if (hasUniversalSelectorInRules(rules)) {
          hasUniversalSelectors = true;
        }
        const shouldForwardProp = parseShouldForwardProp(tag.arguments[0]);
        const withConfigMeta = parseWithConfigMeta(tag.arguments[0]);

        styledDecls.push({
          ...placementHints,
          localName,
          base: { kind: "component", ident },
          styleKey: toStyleKey(localName),
          rules,
          templateExpressions: parsed.slots.map((s) => s.expression),
          rawCss: parsed.rawCss,
          ...(shouldForwardProp ? { shouldForwardProp } : {}),
          ...(withConfigMeta ? { withConfig: withConfigMeta } : {}),
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
          const styleKey = key === "background" ? "backgroundColor" : key;
          const v: any = prop.value;
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

      if (arg0.type === "ObjectExpression") {
        fillFromObject(arg0 as any);
      } else if (arg0.type === "ArrowFunctionExpression") {
        const body: any = arg0.body;
        if (body?.type === "ObjectExpression") {
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

  return { styledDecls, hasUniversalSelectors };
}
