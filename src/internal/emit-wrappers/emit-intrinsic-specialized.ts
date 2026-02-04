/**
 * Emits specialized intrinsic wrappers (input/link/enum/sibling variants).
 */
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { withLeadingComments } from "./comments.js";
import { emitStyleMerging } from "./style-merger.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";

export function emitInputWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const { emitPropsType, shouldAllowAsProp } = ctx.helpers;
  const inputWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );

  if (inputWrapperDecls.length > 0) {
    for (const d of inputWrapperDecls) {
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const allowAsProp = shouldAllowAsProp(d, "input");
      const explicit = emitter.stringifyTsType(d.propsType);
      const baseTypeText =
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
        })();
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
    }
  }
}

export function emitLinkWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const { emitPropsType, shouldAllowAsProp } = ctx.helpers;
  const linkWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );

  if (linkWrapperDecls.length > 0) {
    for (const d of linkWrapperDecls) {
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const allowAsProp = shouldAllowAsProp(d, "a");
      const explicit = emitter.stringifyTsType(d.propsType);
      const baseTypeText =
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
    }
  }
}

export function emitEnumVariantWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const { emitPropsType, shouldAllowAsProp, asDestructureProp } = ctx.helpers;
  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d: StyledDecl) => d.enumVariant);
  if (enumVariantWrappers.length > 0) {
    for (const d of enumVariantWrappers) {
      if (!d.enumVariant) {
        continue;
      }
      const tagName = "div";
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
          typeText: emitter.withChildren(explicit),
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
          typeText,
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

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            ...(allowAsProp ? [asDestructureProp("div")] : []),
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
        [j.jsxSpreadAttribute(j.identifier("sx"))],
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

export function emitSiblingWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const { emitPropsType, shouldAllowAsProp, asDestructureProp } = ctx.helpers;
  // Sibling selector wrappers (Thing + variants)
  const siblingWrappers = wrapperDecls.filter((d: StyledDecl) => d.siblingWrapper);
  for (const d of siblingWrappers) {
    if (d.base.kind !== "intrinsic" || d.base.tagName !== "div") {
      continue;
    }
    const sw = d.siblingWrapper!;
    const tagName = "div";
    const allowAsProp = shouldAllowAsProp(d, "div");

    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const extras: string[] = [];
      extras.push(`${sw.propAdjacent}?: boolean;`);
      if (sw.propAfter) {
        extras.push(`${sw.propAfter}?: boolean;`);
      }
      const extraType = `{ ${extras.join(" ")} }`;
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const baseTypeText = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName: "div",
        allowClassNameProp,
        allowStyleProp,
      });
      const typeText = explicit ?? emitter.joinIntersection(baseTypeText, extraType);
      emitPropsType({
        localName: d.localName,
        tagName,
        typeText,
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
    const childrenId = j.identifier("children");
    const classNameId = j.identifier("className");
    const restId = j.identifier("rest");
    const adjId = j.identifier(sw.propAdjacent);
    const afterId = sw.propAfter ? j.identifier(sw.propAfter) : j.identifier("_unused");

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.objectPattern([
          ...(allowAsProp ? [asDestructureProp("div")] : []),
          emitter.patternProp("children", childrenId),
          emitter.patternProp("className", classNameId),
          emitter.patternProp(sw.propAdjacent, adjId),
          emitter.patternProp(afterId.name, afterId),
          j.restElement(restId),
        ] as any),
        propsId,
      ),
    ]);

    // Build styleArgs for sibling selectors
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgs,
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      ...extraStyleArgsAfterBase,
      j.logicalExpression(
        "&&",
        adjId as any,
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(sw.adjacentKey)),
      ),
      ...(sw.afterKey && sw.propAfter
        ? [
            j.logicalExpression(
              "&&",
              afterId as any,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(sw.afterKey)),
            ),
          ]
        : []),
    ];

    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId: j.identifier("style"),
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
    });

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: JsxAttr[] = [j.jsxSpreadAttribute(restId)];
    emitter.appendMergingAttrs(openingAttrs, merging);

    const jsx = emitter.buildJsxElement({
      tagName: allowAsProp ? "Component" : "div",
      attrs: openingAttrs,
      includeChildren: true,
      childrenExpr: childrenId,
    });

    const bodyStmts: StatementKind[] = [declStmt];
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      emitter.buildWrapperFunction({
        localName: d.localName,
        params: [propsParamId],
        bodyStmts,
        typeParameters:
          allowAsProp && emitTypes
            ? j(`function _<C extends React.ElementType = "div">() { return null }`).get().node
                .program.body[0].typeParameters
            : undefined,
      }),
    );
  }
}
