/**
 * Emits specialized intrinsic wrappers (input/link/enum variants).
 *
 * These handle attribute-driven behavior or wrapper-specific style conditions
 * that need bespoke AST output rather than the generic wrapper paths.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./types.js";
import { withLeadingComments } from "./comments.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";

export function emitInputWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const { emitPropsType, hasForwardedAsUsage, shouldAllowAsProp, withForwardedAsType } =
    ctx.helpers;
  const inputWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );

  if (inputWrapperDecls.length > 0) {
    for (const d of inputWrapperDecls) {
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const allowAsProp = shouldAllowAsProp(d, "input");
      const includesForwardedAs = hasForwardedAsUsage(d);
      const explicit = emitter.stringifyTsType(d.propsType);
      const baseTypeText = withForwardedAsType(
        explicit ??
          (() => {
            const base = "React.InputHTMLAttributes<HTMLInputElement>";
            const omitted: string[] = [];
            if (!allowClassNameProp) {
              omitted.push('"className"');
            }
            if (!allowStyleProp) {
              omitted.push('"style"');
            }
            return omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          })(),
        includesForwardedAs,
      );
      emitPropsType({
        localName: d.localName,
        tagName: "input",
        typeText: baseTypeText,
        allowAsProp,
        allowClassNameProp,
        allowStyleProp,
      });

      const aw = d.attrWrapper!;
      const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
        emitter.splitExtraStyleArgs(d);
      const styleArgs: ExpressionKind[] = [
        ...extraStyleArgs,
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
        ...extraStyleArgsAfterBase,
        ...(aw.checkboxKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("checkbox")),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.checkboxKey)),
              ),
            ]
          : []),
        ...(aw.radioKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("radio")),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.radioKey)),
              ),
            ]
          : []),
        ...(aw.readonlyKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("readOnly"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.readonlyKey)),
              ),
            ]
          : []),
      ];

      emitted.push(
        allowClassNameProp
          ? allowAsProp
            ? emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}<C extends React.ElementType = "input">(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}<C>) {
                  const { as: Component = "input", type, className, ...rest } = props;
                  const sx = stylex.props(${styleArgs});
                  return (
                    <Component
                      {...sx}
                      className={[sx.className, className].filter(Boolean).join(" ")}
                      type={type}
                      {...rest}
                    />
                  );
                }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { as: Component = "input", type, className, ...rest } = props;
                    const sx = stylex.props(${styleArgs});
                    return (
                      <Component
                        {...sx}
                        className={[sx.className, className].filter(Boolean).join(" ")}
                        type={type}
                        {...rest}
                      />
                    );
                  }
                ` as any)
            : emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
                  const { type, className, ...rest } = props;
                  const sx = stylex.props(${styleArgs});
                  return (
                    <input
                      {...sx}
                      className={[sx.className, className].filter(Boolean).join(" ")}
                      type={type}
                      {...rest}
                    />
                  );
                }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { type, className, ...rest } = props;
                    const sx = stylex.props(${styleArgs});
                    return (
                      <input
                        {...sx}
                        className={[sx.className, className].filter(Boolean).join(" ")}
                        type={type}
                        {...rest}
                      />
                    );
                  }
                ` as any)
          : allowAsProp
            ? emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}<C extends React.ElementType = "input">(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}<C>) {
                    const { as: Component = "input", type, ...rest } = props;
                    const sx = stylex.props(${styleArgs});
                    return <Component type={type} {...rest} {...sx} />;
                  }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { as: Component = "input", type, ...rest } = props;
                    const sx = stylex.props(${styleArgs});
                    return <Component type={type} {...rest} {...sx} />;
                  }
                ` as any)
            : emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
                    const { type, ...rest } = props;
                    const sx = stylex.props(${styleArgs});
                    return <input type={type} {...rest} {...sx} />;
                  }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { type, ...rest } = props;
                    const sx = stylex.props(${styleArgs});
                    return <input type={type} {...rest} {...sx} />;
                  }
                ` as any),
      );
      if (includesForwardedAs) {
        const lastEmitted = emitted[emitted.length - 1] as any;
        injectForwardedAsHandling(j, lastEmitted);
      }

      // Post-process: add readOnly destructuring and JSX props when [readonly] is used.
      // Note: [disabled] stays as a StyleX :disabled pseudo-class (semantically equivalent),
      // but [readonly] must be a JS conditional because CSS :read-only is too broad.
      const extraInputProps: string[] = [];
      if (aw.readonlyKey) {
        extraInputProps.push("readOnly");
      }
      if (extraInputProps.length > 0) {
        const lastEmitted = emitted[emitted.length - 1] as any;
        injectExtraInputProps(j, lastEmitted, extraInputProps);
      }
    }
  }
}

export function emitLinkWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const { emitPropsType, hasForwardedAsUsage, shouldAllowAsProp, withForwardedAsType } =
    ctx.helpers;
  const linkWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );

  if (linkWrapperDecls.length > 0) {
    for (const d of linkWrapperDecls) {
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const allowAsProp = shouldAllowAsProp(d, "a");
      const includesForwardedAs = hasForwardedAsUsage(d);
      const explicit = emitter.stringifyTsType(d.propsType);
      const baseTypeText = withForwardedAsType(
        explicit ??
          emitter.withChildren(
            (() => {
              const base = "React.AnchorHTMLAttributes<HTMLAnchorElement>";
              const omitted: string[] = [];
              if (!allowClassNameProp) {
                omitted.push('"className"');
              }
              if (!allowStyleProp) {
                omitted.push('"style"');
              }
              return omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
            })(),
          ),
        includesForwardedAs,
      );
      emitPropsType({
        localName: d.localName,
        tagName: "a",
        typeText: baseTypeText,
        allowAsProp,
        allowClassNameProp,
        allowStyleProp,
      });

      const aw = d.attrWrapper!;
      const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
        emitter.splitExtraStyleArgs(d);
      const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey));
      const styleArgs: ExpressionKind[] = [
        ...extraStyleArgs,
        base,
        ...extraStyleArgsAfterBase,
        ...(aw.externalKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isExternal"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.externalKey)),
              ),
            ]
          : []),
        ...(aw.httpsKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isHttps"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.httpsKey)),
              ),
            ]
          : []),
        ...(aw.pdfKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isPdf"),
                j.memberExpression(j.identifier(stylesIdentifier), j.identifier(aw.pdfKey)),
              ),
            ]
          : []),
      ];

      emitted.push(
        allowClassNameProp
          ? allowAsProp
            ? emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}<C extends React.ElementType = "a">(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}<C>) {
                    const { as: Component = "a", href, target, className, children, ...rest } = props;
                  const isHttps = href?.startsWith("https");
                  const isPdf = href?.endsWith(".pdf");
                  const isExternal = target === "_blank";
                  const sx = stylex.props(${styleArgs});
                  return (
                    <Component
                      {...sx}
                      className={[sx.className, className].filter(Boolean).join(" ")}
                      href={href}
                      target={target}
                        {...rest}
                    >
                      {children}
                    </Component>
                  );
                }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { as: Component = "a", href, target, className, children, ...rest } = props;
                    const isHttps = href?.startsWith("https");
                    const isPdf = href?.endsWith(".pdf");
                    const isExternal = target === "_blank";
                    const sx = stylex.props(${styleArgs});
                    return (
                      <Component
                        {...sx}
                        className={[sx.className, className].filter(Boolean).join(" ")}
                        href={href}
                        target={target}
                        {...rest}
                      >
                        {children}
                      </Component>
                    );
                  }
                ` as any)
            : emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
                    const { href, target, className, children, ...rest } = props;
                  const isHttps = href?.startsWith("https");
                  const isPdf = href?.endsWith(".pdf");
                  const isExternal = target === "_blank";
                  const sx = stylex.props(${styleArgs});
                  return (
                    <a
                      {...sx}
                      className={[sx.className, className].filter(Boolean).join(" ")}
                      href={href}
                      target={target}
                        {...rest}
                    >
                      {children}
                    </a>
                  );
                }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { href, target, className, children, ...rest } = props;
                    const isHttps = href?.startsWith("https");
                    const isPdf = href?.endsWith(".pdf");
                    const isExternal = target === "_blank";
                    const sx = stylex.props(${styleArgs});
                    return (
                      <a
                        {...sx}
                        className={[sx.className, className].filter(Boolean).join(" ")}
                        href={href}
                        target={target}
                        {...rest}
                      >
                        {children}
                      </a>
                    );
                  }
                ` as any)
          : allowAsProp
            ? emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}<C extends React.ElementType = "a">(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}<C>) {
                    const { as: Component = "a", href, target, children, ...rest } = props;
                    const isHttps = href?.startsWith("https");
                    const isPdf = href?.endsWith(".pdf");
                    const isExternal = target === "_blank";
                    const sx = stylex.props(${styleArgs});
                    return (
                      <Component href={href} target={target} {...rest} {...sx}>
                        {children}
                      </Component>
                    );
                  }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { as: Component = "a", href, target, children, ...rest } = props;
                    const isHttps = href?.startsWith("https");
                    const isPdf = href?.endsWith(".pdf");
                    const isExternal = target === "_blank";
                    const sx = stylex.props(${styleArgs});
                    return (
                      <Component href={href} target={target} {...rest} {...sx}>
                        {children}
                      </Component>
                    );
                  }
                ` as any)
            : emitTypes
              ? (j.template.statement`
                  function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
                    const { href, target, children, ...rest } = props;
                    const isHttps = href?.startsWith("https");
                    const isPdf = href?.endsWith(".pdf");
                    const isExternal = target === "_blank";
                    const sx = stylex.props(${styleArgs});
                    return (
                      <a href={href} target={target} {...rest} {...sx}>
                        {children}
                      </a>
                    );
                  }
                ` as any)
              : (j.template.statement`
                  function ${j.identifier(d.localName)}(props) {
                    const { href, target, children, ...rest } = props;
                    const isHttps = href?.startsWith("https");
                    const isPdf = href?.endsWith(".pdf");
                    const isExternal = target === "_blank";
                    const sx = stylex.props(${styleArgs});
                    return (
                      <a href={href} target={target} {...rest} {...sx}>
                        {children}
                      </a>
                    );
                  }
                ` as any),
      );
      if (includesForwardedAs) {
        const lastEmitted = emitted[emitted.length - 1] as any;
        injectForwardedAsHandling(j, lastEmitted);
      }
    }
  }
}

export function emitEnumVariantWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const {
    emitPropsType,
    hasForwardedAsUsage,
    shouldAllowAsProp,
    asDestructureProp,
    withForwardedAsType,
  } = ctx.helpers;
  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d: StyledDecl) => d.enumVariant);
  if (enumVariantWrappers.length > 0) {
    for (const d of enumVariantWrappers) {
      if (!d.enumVariant) {
        continue;
      }
      const tagName = "div";
      const includesForwardedAs = hasForwardedAsUsage(d);
      const allowClassNameProp = false;
      const allowStyleProp = false;
      const allowAsProp = shouldAllowAsProp(d, tagName);
      const { propName, baseKey, cases } = d.enumVariant;
      const primary = cases[0];
      const secondary = cases[1];
      if (!primary || !secondary) {
        continue;
      }
      const explicit = emitter.stringifyTsType(d.propsType);
      if (explicit) {
        emitPropsType({
          localName: d.localName,
          tagName,
          typeText: withForwardedAsType(emitter.withChildren(explicit), includesForwardedAs),
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
        });
      } else {
        // Best-effort: treat enum variant prop as a string-literal union.
        const hasNeq = cases.some((c) => c.kind === "neq");
        const values = [...new Set(cases.map((c) => c.whenValue))].filter(Boolean);
        const union = hasNeq
          ? "string"
          : values.length > 0
            ? values.map((v) => JSON.stringify(v)).join(" | ")
            : "string";
        const typeText = emitter.withChildren(
          `React.HTMLAttributes<HTMLDivElement> & { ${propName}?: ${union} }`,
        );
        emitPropsType({
          localName: d.localName,
          tagName,
          typeText: withForwardedAsType(typeText, includesForwardedAs),
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
        });
      }
      const propsParamId = j.identifier("props");
      if (allowAsProp && emitTypes) {
        emitter.annotatePropsParam(
          propsParamId,
          d.localName,
          `${emitter.propsTypeNameFor(d.localName)}<C>`,
        );
      } else {
        emitter.annotatePropsParam(propsParamId, d.localName);
      }
      const propsId = j.identifier("props");
      const variantId = j.identifier(propName);
      const childrenId = j.identifier("children");
      const forwardedAsId = j.identifier("forwardedAs");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            ...(allowAsProp ? [asDestructureProp("div")] : []),
            ...(includesForwardedAs ? [emitter.patternProp("forwardedAs", forwardedAsId)] : []),
            emitter.patternProp(propName, variantId),
            emitter.patternProp("children", childrenId),
          ] as any),
          propsId,
        ),
      ]);

      const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(baseKey));
      const condPrimary = j.binaryExpression("===", variantId, j.literal(primary.whenValue));
      const condSecondary =
        secondary.kind === "neq"
          ? j.binaryExpression("!==", variantId, j.literal(secondary.whenValue))
          : j.binaryExpression("===", variantId, j.literal(secondary.whenValue));

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("sx"),
          j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
            base,
            j.logicalExpression(
              "&&",
              condPrimary as any,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(primary.styleKey)),
            ),
            j.logicalExpression(
              "&&",
              condSecondary as any,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(secondary.styleKey)),
            ),
          ]),
        ),
      ]);

      const openingEl = j.jsxOpeningElement(
        j.jsxIdentifier(allowAsProp ? "Component" : "div"),
        [
          j.jsxSpreadAttribute(j.identifier("sx")),
          ...(includesForwardedAs
            ? [j.jsxAttribute(j.jsxIdentifier("as"), j.jsxExpressionContainer(forwardedAsId))]
            : []),
        ],
        false,
      );
      const jsx = j.jsxElement(
        openingEl,
        j.jsxClosingElement(j.jsxIdentifier(allowAsProp ? "Component" : "div")),
        [j.jsxExpressionContainer(childrenId)],
      );

      emitted.push(
        withLeadingComments(
          (() => {
            const fn = j.functionDeclaration(
              j.identifier(d.localName),
              [propsParamId],
              j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
            );
            if (allowAsProp && emitTypes) {
              (fn as any).typeParameters = j(
                `function _<C extends React.ElementType = "${tagName}">() { return null }`,
              ).get().node.program.body[0].typeParameters;
            }
            return fn;
          })(),
          d,
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Post-processing helpers
// ---------------------------------------------------------------------------

/**
 * Inject extra destructured props (e.g., `disabled`, `readOnly`) into an
 * input wrapper function's parameter destructuring and JSX element.
 *
 * Modifies the AST in-place:
 *   Destructuring: `{ type, ...rest }` → `{ type, disabled, readOnly, ...rest }`
 *   JSX: `<input type={type} {...rest}>` → `<input type={type} disabled={disabled} readOnly={readOnly} {...rest}>`
 */
function injectExtraInputProps(j: JSCodeshift, fnDecl: unknown, extraProps: string[]): void {
  if (!fnDecl || typeof fnDecl !== "object") {
    return;
  }

  const queue: unknown[] = [fnDecl];
  while (queue.length > 0) {
    const node = queue.pop();
    if (!node || typeof node !== "object") {
      continue;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        queue.push(item);
      }
      continue;
    }

    const n = node as Record<string, unknown>;

    // Inject into destructuring: { type, ...rest } → { type, disabled, readOnly, ...rest }
    if (n.type === "ObjectPattern" && Array.isArray(n.properties)) {
      const properties = n.properties as unknown[];
      const restIdx = properties.findIndex(
        (p: unknown) =>
          !!p &&
          typeof p === "object" &&
          ((p as Record<string, unknown>).type === "RestElement" ||
            (p as Record<string, unknown>).type === "RestProperty" ||
            (p as Record<string, unknown>).type === "SpreadProperty"),
      );
      if (restIdx >= 0) {
        const toInsert = extraProps.map((name) => {
          const id = j.identifier(name);
          const prop = j.property("init", id, id);
          (prop as unknown as Record<string, unknown>).shorthand = true;
          return prop;
        });
        properties.splice(restIdx, 0, ...toInsert);
      }
    }

    // Inject JSX attributes: <input type={type} {...rest}> → <input type={type} disabled={disabled} readOnly={readOnly} {...rest}>
    if (n.type === "JSXOpeningElement" && Array.isArray(n.attributes)) {
      const nameNode = n.name as Record<string, unknown> | undefined;
      const tagName = nameNode?.type === "JSXIdentifier" ? String(nameNode.name) : "";
      if (tagName === "input" || tagName === "Component") {
        const attrs = n.attributes as unknown[];
        // Find the first spread attribute position
        const spreadIdx = attrs.findIndex(
          (a: unknown) =>
            !!a &&
            typeof a === "object" &&
            (a as Record<string, unknown>).type === "JSXSpreadAttribute",
        );
        const insertIdx = spreadIdx >= 0 ? spreadIdx : attrs.length;
        const toInsert = extraProps.map((name) =>
          j.jsxAttribute(j.jsxIdentifier(name), j.jsxExpressionContainer(j.identifier(name))),
        );
        attrs.splice(insertIdx, 0, ...toInsert);
      }
    }

    // Recurse
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "start" || key === "end" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }
}

/**
 * Inject `forwardedAs` support into emitted intrinsic wrapper functions.
 *
 * - Adds `forwardedAs` to destructuring so it doesn't leak via `{...rest}` as `forwardedas`
 * - Adds `as={forwardedAs}` on rendered JSX elements/components to match styled-components
 *   semantics where `forwardedAs` lowers to an `as` attribute (not polymorphic outer `as`)
 */
function injectForwardedAsHandling(j: JSCodeshift, fnDecl: unknown): void {
  if (!fnDecl || typeof fnDecl !== "object") {
    return;
  }

  const queue: unknown[] = [fnDecl];
  while (queue.length > 0) {
    const node = queue.pop();
    if (!node || typeof node !== "object") {
      continue;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        queue.push(item);
      }
      continue;
    }

    const n = node as Record<string, unknown>;

    if (n.type === "ObjectPattern" && Array.isArray(n.properties)) {
      const properties = n.properties as unknown[];
      const hasForwardedAs = properties.some((p: unknown) => {
        if (!p || typeof p !== "object") {
          return false;
        }
        const prop = p as Record<string, unknown>;
        if (prop.type !== "Property") {
          return false;
        }
        const key = prop.key as Record<string, unknown> | undefined;
        return key?.type === "Identifier" && key.name === "forwardedAs";
      });
      if (!hasForwardedAs) {
        const restIdx = properties.findIndex(
          (p: unknown) =>
            !!p &&
            typeof p === "object" &&
            ((p as Record<string, unknown>).type === "RestElement" ||
              (p as Record<string, unknown>).type === "RestProperty" ||
              (p as Record<string, unknown>).type === "SpreadProperty"),
        );
        const insertIdx = restIdx >= 0 ? restIdx : properties.length;
        const id = j.identifier("forwardedAs");
        const prop = j.property("init", id, id);
        (prop as unknown as Record<string, unknown>).shorthand = true;
        properties.splice(insertIdx, 0, prop);
      }
    }

    if (n.type === "JSXOpeningElement" && Array.isArray(n.attributes)) {
      const attrs = n.attributes as unknown[];
      const hasAsAttr = attrs.some((a: unknown) => {
        if (!a || typeof a !== "object") {
          return false;
        }
        const attr = a as Record<string, unknown>;
        if (attr.type !== "JSXAttribute") {
          return false;
        }
        const name = attr.name as Record<string, unknown> | undefined;
        return name?.type === "JSXIdentifier" && name.name === "as";
      });
      if (!hasAsAttr) {
        attrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("as"),
            j.jsxExpressionContainer(j.identifier("forwardedAs")),
          ),
        );
      }
    }

    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "start" || key === "end" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }
}
