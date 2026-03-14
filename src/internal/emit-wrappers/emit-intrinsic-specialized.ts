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
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import { appendAllPseudoStyleArgs } from "./emit-intrinsic-simple.js";
import { styleRef } from "./style-expr-builders.js";

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
        ...emitter.baseStyleExpr(d),
        ...extraStyleArgsAfterBase,
        ...(aw.checkboxKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("checkbox")),
                styleRef(j, stylesIdentifier, aw.checkboxKey),
              ),
            ]
          : []),
        ...(aw.radioKey
          ? [
              j.logicalExpression(
                "&&",
                j.binaryExpression("===", j.identifier("type"), j.literal("radio")),
                styleRef(j, stylesIdentifier, aw.radioKey),
              ),
            ]
          : []),
        ...(aw.readonlyKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("readOnly"),
                styleRef(j, stylesIdentifier, aw.readonlyKey),
              ),
            ]
          : []),
      ];

      const pseudoGuardPropsInput = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

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
      if (d.supportsRefProp) {
        const lastEmitted = emitted[emitted.length - 1] as any;
        injectExplicitRefForwarding(j, lastEmitted);
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

      // Post-process: add pseudo-alias guard props to destructuring
      if (pseudoGuardPropsInput.length > 0) {
        injectDestructureProps(j, emitted[emitted.length - 1] as any, pseudoGuardPropsInput);
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
      const styleArgs: ExpressionKind[] = [
        ...extraStyleArgs,
        ...emitter.baseStyleExpr(d),
        ...extraStyleArgsAfterBase,
        ...(aw.externalKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isExternal"),
                styleRef(j, stylesIdentifier, aw.externalKey),
              ),
            ]
          : []),
        ...(aw.httpsKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isHttps"),
                styleRef(j, stylesIdentifier, aw.httpsKey),
              ),
            ]
          : []),
        ...(aw.pdfKey
          ? [
              j.logicalExpression(
                "&&",
                j.identifier("isPdf"),
                styleRef(j, stylesIdentifier, aw.pdfKey),
              ),
            ]
          : []),
      ];

      const pseudoGuardPropsLink = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

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
      if (d.supportsRefProp) {
        const lastEmitted = emitted[emitted.length - 1] as any;
        injectExplicitRefForwarding(j, lastEmitted);
      }

      // Post-process: add pseudo-alias guard props to destructuring
      if (pseudoGuardPropsLink.length > 0) {
        injectDestructureProps(j, emitted[emitted.length - 1] as any, pseudoGuardPropsLink);
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

      const base = styleRef(j, stylesIdentifier, baseKey);
      const condPrimary = j.binaryExpression("===", variantId, j.literal(primary.whenValue));
      const condSecondary =
        secondary.kind === "neq"
          ? j.binaryExpression("!==", variantId, j.literal(secondary.whenValue))
          : j.binaryExpression("===", variantId, j.literal(secondary.whenValue));

      const styleArgs: ExpressionKind[] = [
        base,
        j.logicalExpression(
          "&&",
          condPrimary as any,
          styleRef(j, stylesIdentifier, primary.styleKey),
        ),
        j.logicalExpression(
          "&&",
          condSecondary as any,
          styleRef(j, stylesIdentifier, secondary.styleKey),
        ),
      ];

      const pseudoGuardPropsEnum = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

      // Inject guard props into the destructuring pattern
      if (pseudoGuardPropsEnum.length > 0) {
        injectDestructureProps(j, declStmt, pseudoGuardPropsEnum);
      }

      const sxDecl = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.identifier("sx"),
          j.callExpression(
            j.memberExpression(j.identifier("stylex"), j.identifier("props")),
            styleArgs,
          ),
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
              (fn as any).typeParameters = buildPolymorphicTypeParams(j, tagName);
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

// ---------------------------------------------------------------------------
// Shared AST injection helpers
// ---------------------------------------------------------------------------

type AstRecord = Record<string, unknown>;

/** BFS-walk an AST node, calling visitors for matching node types. */
function walkAstBfs(
  root: unknown,
  visitors: {
    ObjectPattern?: (properties: unknown[]) => boolean | void;
    JSXOpeningElement?: (node: AstRecord, attrs: unknown[]) => void;
  },
): void {
  if (!root || typeof root !== "object") {
    return;
  }
  const queue: unknown[] = [root];
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
    const n = node as AstRecord;
    if (n.type === "ObjectPattern" && Array.isArray(n.properties) && visitors.ObjectPattern) {
      if (visitors.ObjectPattern(n.properties as unknown[]) === true) {
        return;
      }
    }
    if (
      n.type === "JSXOpeningElement" &&
      Array.isArray(n.attributes) &&
      visitors.JSXOpeningElement
    ) {
      visitors.JSXOpeningElement(n, n.attributes as unknown[]);
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

/** Find the index of a rest/spread element in an ObjectPattern's properties. */
function findRestIndex(properties: unknown[]): number {
  return properties.findIndex(
    (p: unknown) =>
      !!p &&
      typeof p === "object" &&
      ((p as AstRecord).type === "RestElement" ||
        (p as AstRecord).type === "RestProperty" ||
        (p as AstRecord).type === "SpreadProperty"),
  );
}

/** Check whether an ObjectPattern already has a property with the given name. */
function hasPropertyNamed(properties: unknown[], name: string): boolean {
  return properties.some((p: unknown) => {
    if (!p || typeof p !== "object") {
      return false;
    }
    const prop = p as AstRecord;
    if (prop.type !== "Property") {
      return false;
    }
    const key = prop.key as AstRecord | undefined;
    return key?.type === "Identifier" && key.name === name;
  });
}

/** Check whether a JSXOpeningElement already has an attribute with the given name. */
function hasJsxAttributeNamed(attrs: unknown[], name: string): boolean {
  return attrs.some((a: unknown) => {
    if (!a || typeof a !== "object") {
      return false;
    }
    const attr = a as AstRecord;
    if (attr.type !== "JSXAttribute") {
      return false;
    }
    const nameNode = attr.name as AstRecord | undefined;
    return nameNode?.type === "JSXIdentifier" && nameNode.name === name;
  });
}

/** Find the first JSXSpreadAttribute index (for insertion before spreads). */
function findJsxSpreadIndex(attrs: unknown[]): number {
  return attrs.findIndex(
    (a: unknown) => !!a && typeof a === "object" && (a as AstRecord).type === "JSXSpreadAttribute",
  );
}

/** Create shorthand destructure properties, optionally filtering out existing names. */
function makeShorthandProps(
  j: JSCodeshift,
  names: string[],
  existingNames?: Set<string>,
): unknown[] {
  const filtered = existingNames ? names.filter((n) => !existingNames.has(n)) : names;
  return filtered.map((name) => {
    const id = j.identifier(name);
    const prop = j.property("init", id, id);
    (prop as unknown as AstRecord).shorthand = true;
    return prop;
  });
}

/** Collect existing binding names from an ObjectPattern's properties. */
function collectExistingNames(properties: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const p of properties) {
    if (p && typeof p === "object") {
      const pr = p as AstRecord;
      if (pr.type === "Property" && pr.key && typeof pr.key === "object") {
        const key = pr.key as AstRecord;
        if (key.type === "Identifier" && typeof key.name === "string") {
          names.add(key.name);
        }
      }
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Injection functions (thin wrappers over shared helpers)
// ---------------------------------------------------------------------------

/**
 * Ensure emitted wrappers forward refs explicitly:
 *   Destructuring: `{ ..., ...rest }` -> `{ ..., ref, ...rest }`
 *   JSX: `<Tag {...rest} ...>` -> `<Tag ref={ref} {...rest} ...>`
 */
function injectExplicitRefForwarding(j: JSCodeshift, fnDecl: unknown): void {
  walkAstBfs(fnDecl, {
    ObjectPattern(properties) {
      if (!hasPropertyNamed(properties, "ref")) {
        const insertIdx = Math.max(findRestIndex(properties), 0) || properties.length;
        properties.splice(insertIdx, 0, ...makeShorthandProps(j, ["ref"]));
      }
    },
    JSXOpeningElement(_node, attrs) {
      if (!hasJsxAttributeNamed(attrs, "ref")) {
        const spreadIdx = findJsxSpreadIndex(attrs);
        const insertIdx = spreadIdx >= 0 ? spreadIdx : attrs.length;
        attrs.splice(
          insertIdx,
          0,
          j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(j.identifier("ref"))),
        );
      }
    },
  });
}

/**
 * Inject extra destructured props and JSX attributes (e.g., `disabled`, `readOnly`).
 */
function injectExtraInputProps(j: JSCodeshift, fnDecl: unknown, extraProps: string[]): void {
  walkAstBfs(fnDecl, {
    ObjectPattern(properties) {
      const restIdx = findRestIndex(properties);
      if (restIdx >= 0) {
        properties.splice(restIdx, 0, ...makeShorthandProps(j, extraProps));
      }
    },
    JSXOpeningElement(node, attrs) {
      const nameNode = node.name as AstRecord | undefined;
      const tagName = nameNode?.type === "JSXIdentifier" ? String(nameNode.name) : "";
      if (tagName === "input" || tagName === "Component") {
        const spreadIdx = findJsxSpreadIndex(attrs);
        const insertIdx = spreadIdx >= 0 ? spreadIdx : attrs.length;
        const toInsert = extraProps.map((name) =>
          j.jsxAttribute(j.jsxIdentifier(name), j.jsxExpressionContainer(j.identifier(name))),
        );
        attrs.splice(insertIdx, 0, ...toInsert);
      }
    },
  });
}

/**
 * Inject `forwardedAs` into destructuring and `as={forwardedAs}` on JSX elements.
 */
function injectForwardedAsHandling(j: JSCodeshift, fnDecl: unknown): void {
  walkAstBfs(fnDecl, {
    ObjectPattern(properties) {
      if (!hasPropertyNamed(properties, "forwardedAs")) {
        const restIdx = findRestIndex(properties);
        const insertIdx = restIdx >= 0 ? restIdx : properties.length;
        properties.splice(insertIdx, 0, ...makeShorthandProps(j, ["forwardedAs"]));
      }
    },
    JSXOpeningElement(_node, attrs) {
      if (!hasJsxAttributeNamed(attrs, "as")) {
        attrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("as"),
            j.jsxExpressionContainer(j.identifier("forwardedAs")),
          ),
        );
      }
    },
  });
}

/**
 * Inject extra props into destructuring only (not JSX).
 * Used for pseudo-alias guard props that need to be in scope for style expressions.
 */
function injectDestructureProps(j: JSCodeshift, fnDecl: unknown, props: string[]): void {
  if (props.length === 0) {
    return;
  }
  walkAstBfs(fnDecl, {
    ObjectPattern(properties) {
      const existingNames = collectExistingNames(properties);
      const restIdx = findRestIndex(properties);
      const insertIdx = restIdx >= 0 ? restIdx : properties.length;
      properties.splice(insertIdx, 0, ...makeShorthandProps(j, props, existingNames));
      return true; // stop after first ObjectPattern
    },
  });
}
