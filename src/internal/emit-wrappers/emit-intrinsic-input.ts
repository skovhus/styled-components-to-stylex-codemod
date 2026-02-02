import type { StyledDecl } from "../transform-types.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-context.js";
import type { ExpressionKind } from "./types.js";
import { extraStyleArgsFor } from "./emit-intrinsic-helpers.js";

export function emitInputWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitPropsType, emitted } = ctx;
  const { j, stylesIdentifier, emitTypes, wrapperDecls } = emitter;
  const inputWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );

  if (inputWrapperDecls.length === 0) {
    return;
  }

  for (const d of inputWrapperDecls) {
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, "input");
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
    emitPropsType(d.localName, baseTypeText, allowAsProp);

    const aw = d.attrWrapper!;
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgsFor(emitter, d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
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
                function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
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
                function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
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

export function emitLinkWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitPropsType, emitted } = ctx;
  const { j, stylesIdentifier, emitTypes, wrapperDecls } = emitter;
  const linkWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );

  if (linkWrapperDecls.length === 0) {
    return;
  }

  for (const d of linkWrapperDecls) {
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, "a");
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
    emitPropsType(d.localName, baseTypeText, allowAsProp);

    const aw = d.attrWrapper!;
    const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey));
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgsFor(emitter, d),
      base,
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
                function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
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
                function ${j.identifier(d.localName)}(props: ${j.identifier(emitter.propsTypeNameFor(d.localName))}) {
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
