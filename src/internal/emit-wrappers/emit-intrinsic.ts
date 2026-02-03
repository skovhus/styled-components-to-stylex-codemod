import type { ASTNode } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { buildStyleFnConditionExpr } from "../utilities/jscodeshift-utils.js";
import { emitStyleMerging } from "./style-merger.js";
import { collectInlineStylePropNames, type ExpressionKind, type InlineStyleProp } from "./types.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { withLeadingComments, withLeadingCommentsOnFirstFunction } from "./comments.js";
import type { JsxAttr, StatementKind, WrapperEmitter } from "./wrapper-emitter.js";

export function emitIntrinsicWrappers(emitter: WrapperEmitter): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
} {
  const root = emitter.root;
  const j = emitter.j;
  const emitTypes = emitter.emitTypes;
  const wrapperDecls = emitter.wrapperDecls;
  const wrapperNames = emitter.wrapperNames;
  const stylesIdentifier = emitter.stylesIdentifier;
  const styleMerger = emitter.styleMerger;
  const patternProp = emitter.patternProp;

  // Use emitter methods directly throughout this file to avoid threading helper lambdas.

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  const emitNamedPropsType = (localName: string, typeExprText: string, genericParams?: string) =>
    emitter.emitNamedPropsType({ localName, typeExprText, genericParams, emitted });

  const emitMinimalWrapper = (args: any): ASTNode[] =>
    emitter.emitMinimalWrapper({
      localName: args.localName,
      tagName: args.tagName,
      propsTypeName: args.propsTypeName,
      inlineTypeText: args.inlineTypeText,
      styleArgs: args.styleArgs,
      destructureProps: args.destructureProps,
      propDefaults: args.propDefaults,
      allowClassNameProp: args.allowClassNameProp,
      allowStyleProp: args.allowStyleProp,
      includeRest: args.includeRest,
      defaultAttrs: args.defaultAttrs,
      conditionalAttrs: args.conditionalAttrs,
      invertedBoolAttrs: args.invertedBoolAttrs,
      staticAttrs: args.staticAttrs,
      inlineStyleProps: args.inlineStyleProps,
    });

  const extraStyleArgsFor = (d: StyledDecl): ExpressionKind[] =>
    (d.extraStyleKeys ?? []).map((key) =>
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key)),
    );

  const shouldIncludeRestForProps = (args: {
    usedAsValue: boolean;
    hasLocalUsage: boolean;
    usedAttrs: Set<string>;
    destructureProps: string[];
    hasExplicitPropsToPassThrough?: boolean;
    ignoreTransientAttrs?: boolean;
  }): boolean => {
    const {
      usedAsValue,
      hasLocalUsage,
      usedAttrs,
      destructureProps,
      hasExplicitPropsToPassThrough,
      ignoreTransientAttrs = false,
    } = args;
    let shouldIncludeRest =
      usedAsValue ||
      Boolean(hasExplicitPropsToPassThrough) ||
      (hasLocalUsage && usedAttrs.has("*")) ||
      (hasLocalUsage &&
        [...usedAttrs].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs" ||
            (ignoreTransientAttrs && n.startsWith("$"))
          ) {
            return false;
          }
          return !destructureProps.includes(n);
        }));
    const hasOnlyTransientAttrs =
      !usedAttrs.has("*") && usedAttrs.size > 0 && [...usedAttrs].every((n) => n.startsWith("$"));
    if (!usedAsValue && hasOnlyTransientAttrs) {
      shouldIncludeRest = false;
    }
    return shouldIncludeRest;
  };

  /**
   * Build compound variant expressions for multi-prop nested ternaries.
   * Generates: outerProp ? styles.outerKey : innerProp ? styles.innerTrueKey : styles.innerFalseKey
   *
   * @param compoundVariants - Array of compound variant configurations
   * @param styleArgs - Array to push generated expressions into
   * @param destructureProps - Optional array to track props that need destructuring
   */
  const buildCompoundVariantExpressions = (
    compoundVariants: NonNullable<StyledDecl["compoundVariants"]>,
    styleArgs: ExpressionKind[],
    destructureProps?: string[],
  ): void => {
    for (const cv of compoundVariants) {
      // Add props to destructure list
      if (destructureProps) {
        if (!destructureProps.includes(cv.outerProp)) {
          destructureProps.push(cv.outerProp);
        }
        if (!destructureProps.includes(cv.innerProp)) {
          destructureProps.push(cv.innerProp);
        }
      }

      // Build: outerProp ? styles.outerKey : innerProp ? styles.innerTrueKey : styles.innerFalseKey
      const outerPropId = j.identifier(cv.outerProp);
      const innerPropId = j.identifier(cv.innerProp);
      const outerStyle = j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(cv.outerTruthyKey),
      );
      const innerTrueStyle = j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(cv.innerTruthyKey),
      );
      const innerFalseStyle = j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(cv.innerFalsyKey),
      );

      // Build inner ternary: innerProp ? innerTrueStyle : innerFalseStyle
      const innerTernary = j.conditionalExpression(innerPropId, innerTrueStyle, innerFalseStyle);

      // Build outer ternary: outerProp ? outerStyle : innerTernary
      const outerTernary = j.conditionalExpression(outerPropId, outerStyle, innerTernary);

      styleArgs.push(outerTernary);
    }
  };

  /**
   * Check if defaultAttrs references element props (non-$-prefixed props).
   * When attrs like `tabIndex: props.tabIndex ?? 0` are used, the jsxProp is "tabIndex"
   * which is an element prop that needs to be included in the type.
   */
  const hasElementPropsInDefaultAttrs = (d: StyledDecl): boolean => {
    const defaultAttrs = d.attrsInfo?.defaultAttrs ?? [];
    return defaultAttrs.some((a) => a.jsxProp && !a.jsxProp.startsWith("$"));
  };

  const mergeAsIntoPropsWithChildren = (typeText: string): string | null => {
    const prefix = "React.PropsWithChildren<";
    if (!typeText.trim().startsWith(prefix) || !typeText.trim().endsWith(">")) {
      return null;
    }
    const inner = typeText.trim().slice(prefix.length, -1).trim();
    if (inner === "{}") {
      return `${prefix}{ as?: React.ElementType }>`;
    }
    if (inner.startsWith("{") && inner.endsWith("}")) {
      let body = inner.slice(1, -1).trim();
      if (body.endsWith(";")) {
        body = body.slice(0, -1).trim();
      }
      const withAs = body.length > 0 ? `${body}; as?: React.ElementType` : "as?: React.ElementType";
      return `${prefix}{ ${withAs} }>`;
    }
    return null;
  };

  const addAsPropToExistingType = (typeName: string): boolean => {
    if (!emitTypes) {
      return false;
    }
    let didUpdate = false;
    const interfaces = root.find(j.TSInterfaceDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    interfaces.forEach((path: any) => {
      const iface = path.node;
      const members = iface.body?.body ?? [];
      const hasAs = members.some(
        (m: any) =>
          m.type === "TSPropertySignature" && m.key?.type === "Identifier" && m.key.name === "as",
      );
      if (hasAs) {
        didUpdate = true;
        return;
      }
      const parsed = j(`interface X { as?: React.ElementType }`).get().node.program.body[0] as any;
      const prop = parsed.body?.body?.[0];
      if (prop) {
        members.push(prop);
        didUpdate = true;
      }
    });
    if (didUpdate) {
      return true;
    }
    const typeAliases = root.find(j.TSTypeAliasDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    typeAliases.forEach((path: any) => {
      const alias = path.node;
      const existing = alias.typeAnnotation;
      if (!existing) {
        return;
      }
      const existingStr = j(existing).toSource();
      if (existingStr.includes("as?:") || existingStr.includes("as :")) {
        didUpdate = true;
        return;
      }
      const parsed = j(`type X = { as?: React.ElementType };`).get().node.program.body[0] as any;
      const asType = parsed.typeAnnotation;
      if (!asType) {
        return;
      }
      if (existing.type === "TSIntersectionType") {
        existing.types = [...(existing.types ?? []), asType];
      } else {
        alias.typeAnnotation = j.tsIntersectionType([existing, asType]);
      }
      didUpdate = true;
    });
    return didUpdate;
  };

  const shouldAllowAsProp = (d: StyledDecl, tagName: string): boolean =>
    emitter.shouldAllowAsPropForIntrinsic(d, tagName);

  const asDestructureProp = (tagName: string) =>
    j.property.from({
      kind: "init",
      key: j.identifier("as"),
      value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
      shorthand: false,
    });

  const withAsPropType = (typeText: string, allowAsProp: boolean): string => {
    if (!allowAsProp) {
      return typeText;
    }
    const merged = mergeAsIntoPropsWithChildren(typeText);
    if (merged) {
      return merged;
    }
    return emitter.joinIntersection(typeText, "{ as?: React.ElementType }");
  };

  const emitPropsType = (localName: string, typeText: string, allowAsProp: boolean): boolean => {
    const typeAliasEmitted = emitNamedPropsType(localName, withAsPropType(typeText, allowAsProp));
    if (!typeAliasEmitted && allowAsProp) {
      addAsPropToExistingType(emitter.propsTypeNameFor(localName));
    }
    needsReactTypeImport = true;
    return typeAliasEmitted;
  };

  const inputWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );
  const linkWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );
  const intrinsicPolymorphicWrapperDecls = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip specialized wrappers (input/link with attrWrapper) - they have their own handlers
    if (d.attrWrapper) {
      return false;
    }
    // Use wrapperNames (includes props type check and JSX usage) OR supportsAsProp (adapter opt-in)
    return wrapperNames.has(d.localName) || (d.supportsAsProp ?? false);
  });
  const shouldForwardPropWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) => d.shouldForwardProp && !d.enumVariant && d.base.kind === "intrinsic",
  );

  // --- BEGIN extracted blocks from `emit-wrappers.ts` (kept mechanically identical) ---

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
      emitPropsType(d.localName, baseTypeText, allowAsProp);

      const aw = d.attrWrapper!;
      const styleArgs: ExpressionKind[] = [
        ...extraStyleArgsFor(d),
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
      emitPropsType(d.localName, baseTypeText, allowAsProp);

      const aw = d.attrWrapper!;
      const base = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey));
      const styleArgs: ExpressionKind[] = [
        ...extraStyleArgsFor(d),
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

  if (intrinsicPolymorphicWrapperDecls.length > 0) {
    for (const d of intrinsicPolymorphicWrapperDecls) {
      if (d.base.kind !== "intrinsic") {
        continue;
      }
      const tagName = d.base.tagName;
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const allowAsProp = shouldAllowAsProp(d, tagName);
      const explicit = emitter.stringifyTsType(d.propsType);

      // Check if the explicit props type is a simple (non-generic) type reference.
      // If so, we should NOT make the wrapper function generic - just use the existing type directly.
      const isExplicitNonGenericType =
        explicit && d.propsType?.type === "TSTypeReference" && !d.propsType.typeParameters;

      // Polymorphic `as` wrappers: type the wrapper generically so the chosen `as` value
      // influences allowed props (e.g. htmlFor when as="label", react-spring style props when as={animated.span}).
      // Exception: if the original props type is already defined and non-generic, use it directly.
      const typeText = (() => {
        if (explicit) {
          return explicit;
        }
        const used = emitter.getUsedAttrs(d.localName);
        // Use ComponentPropsWithRef when ref is used on the component
        const hasRef = used.has("ref");
        const base = hasRef
          ? "React.ComponentPropsWithRef<C>"
          : "React.ComponentPropsWithoutRef<C>";
        // Omit className/style only when we don't want to support them.
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        const baseMaybeOmitted =
          omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        if (!allowAsProp) {
          return baseMaybeOmitted;
        }
        return emitter.joinIntersection(baseMaybeOmitted, "{ as?: C }");
      })();

      if (!isExplicitNonGenericType) {
        emitNamedPropsType(d.localName, typeText, `C extends React.ElementType = "${tagName}"`);
      }
      needsReactTypeImport = true;

      const styleArgs: ExpressionKind[] = [
        ...(d.extendsStyleKey
          ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
          : []),
        ...extraStyleArgsFor(d),
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      ];

      // Track props that need to be destructured for variant styles
      const destructureProps: string[] = [];
      // Track default values for props (for destructuring defaults)
      const propDefaults = new Map<string, string>();

      // Collect keys used by compound variants (they're handled separately)
      const compoundVariantKeys = new Set<string>();
      for (const cv of d.compoundVariants ?? []) {
        compoundVariantKeys.add(cv.outerProp);
        compoundVariantKeys.add(`${cv.innerProp}True`);
        compoundVariantKeys.add(`${cv.innerProp}False`);
      }

      // Add variant style arguments if this component has variants
      if (d.variantStyleKeys) {
        const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
        for (const [when, variantKey] of sortedEntries) {
          // Skip keys handled by compound variants
          if (compoundVariantKeys.has(when)) {
            continue;
          }
          const { cond, isBoolean } = emitter.collectConditionProps({ when, destructureProps });
          const styleExpr = j.memberExpression(
            j.identifier(stylesIdentifier),
            j.identifier(variantKey),
          );
          // Use makeConditionalStyleExpr to handle boolean vs non-boolean conditions correctly.
          // For boolean conditions, && is used. For non-boolean (could be "" or 0), ternary is used.
          styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean }));
        }
      }

      // Add variant dimension lookups (StyleX variants recipe pattern)
      if (d.variantDimensions) {
        emitter.buildVariantDimensionLookups({
          dimensions: d.variantDimensions,
          styleArgs,
          destructureProps,
          propDefaults,
        });
      }

      // Add compound variant expressions (multi-prop nested ternaries)
      if (d.compoundVariants) {
        buildCompoundVariantExpressions(d.compoundVariants, styleArgs, destructureProps);
      }

      // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
      if (d.extraStylexPropsArgs) {
        for (const extra of d.extraStylexPropsArgs) {
          if (extra.when) {
            const { cond, isBoolean } = emitter.collectConditionProps({
              when: extra.when,
              destructureProps,
            });
            styleArgs.push(
              emitter.makeConditionalStyleExpr({ cond, expr: extra.expr as any, isBoolean }),
            );
          } else {
            styleArgs.push(extra.expr as any);
          }
        }
      }

      for (const prop of collectInlineStylePropNames(d.inlineStyleProps ?? [])) {
        if (!destructureProps.includes(prop)) {
          destructureProps.push(prop);
        }
      }

      // Add style function calls for dynamic prop-based styles
      emitter.buildStyleFnExpressions({
        d,
        styleArgs,
        destructureProps,
      });
      emitter.collectDestructurePropsFromStyleFns({ d, styleArgs, destructureProps });

      const isVoidTag = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildren = allowAsProp || !isVoidTag;
      const propsParamId = j.identifier("props");
      if (emitTypes) {
        if (isExplicitNonGenericType) {
          // Use the existing non-generic type directly without making the function generic
          (propsParamId as any).typeAnnotation = j(
            `const x: ${explicit} = null`,
          ).get().node.program.body[0].declarations[0].id.typeAnnotation;
        } else {
          // Make the wrapper function generic so `as` can influence props.
          const tp = j(
            `function _<C extends React.ElementType = "${tagName}">() { return null }`,
          ).get().node.program.body[0].typeParameters;
          (propsParamId as any).typeAnnotation = j(
            `const x: ${emitter.propsTypeNameFor(d.localName)}<C> = null`,
          ).get().node.program.body[0].declarations[0].id.typeAnnotation;
          (propsParamId as any).typeParameters = tp;
        }
      }
      const propsId = j.identifier("props");
      const childrenId = j.identifier("children");
      const restId = j.identifier("rest");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            ...(allowAsProp
              ? [
                  j.property.from({
                    kind: "init",
                    key: j.identifier("as"),
                    value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
                    shorthand: false,
                  }),
                ]
              : []),
            ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
            ...(includeChildren ? [patternProp("children", childrenId)] : []),
            ...(allowStyleProp ? [patternProp("style", styleId)] : []),
            // Add variant props to destructuring (with defaults when available)
            ...destructureProps.filter(Boolean).map((name) => {
              const defaultVal = propDefaults.get(name);
              if (defaultVal) {
                // Create property with default: { name = "defaultValue" }
                return j.property.from({
                  kind: "init",
                  key: j.identifier(name),
                  value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
                  shorthand: false,
                });
              }
              return patternProp(name);
            }),
            j.restElement(restId),
          ] as any),
          propsId,
        ),
      ]);

      const merging = emitStyleMerging({
        j,
        emitter,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: [],
      });

      const attrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: d.attrsInfo,
          propExprFor: (prop) => j.identifier(prop),
        }),
        j.jsxSpreadAttribute(restId),
      ];
      emitter.appendMergingAttrs(attrs, merging);
      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs,
        includeChildren,
        childrenExpr: childrenId,
      });

      const fnBodyStmts: StatementKind[] = [declStmt];
      if (merging.sxDecl) {
        fnBodyStmts.push(merging.sxDecl);
      }
      fnBodyStmts.push(j.returnStatement(jsx as any));

      emitted.push(
        emitter.buildWrapperFunction({
          localName: d.localName,
          params: [propsParamId],
          bodyStmts: fnBodyStmts,
          moveTypeParamsFromParam: propsParamId,
        }),
      );
    }
  }

  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d: StyledDecl) => d.enumVariant);
  if (enumVariantWrappers.length > 0) {
    for (const d of enumVariantWrappers) {
      if (!d.enumVariant) {
        continue;
      }
      const allowAsProp = shouldAllowAsProp(d, "div");
      const { propName, baseKey, cases } = d.enumVariant;
      const primary = cases[0];
      const secondary = cases[1];
      if (!primary || !secondary) {
        continue;
      }
      const explicit = emitter.stringifyTsType(d.propsType);
      if (explicit) {
        emitPropsType(d.localName, emitter.withChildren(explicit), allowAsProp);
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
        emitPropsType(d.localName, typeText, allowAsProp);
      }
      const propsParamId = j.identifier("props");
      emitter.annotatePropsParam(propsParamId, d.localName);
      const propsId = j.identifier("props");
      const variantId = j.identifier(propName);
      const childrenId = j.identifier("children");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
            ...(allowAsProp ? [asDestructureProp("div")] : []),
            patternProp(propName, variantId),
            patternProp("children", childrenId),
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
          j.functionDeclaration(
            j.identifier(d.localName),
            [propsParamId],
            j.blockStatement([declStmt, sxDecl, j.returnStatement(jsx as any)]),
          ),
          d,
        ),
      );
    }
  }

  // Generic wrappers for `withConfig({ shouldForwardProp })` cases.
  for (const d of shouldForwardPropWrapperDecls) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = shouldAllowAsProp(d, tagName);

    const extraProps = new Set<string>();
    for (const p of d.shouldForwardProp?.dropProps ?? []) {
      if (p) {
        extraProps.add(p);
      }
    }
    for (const when of Object.keys(d.variantStyleKeys ?? {})) {
      const { props } = emitter.collectConditionProps({ when });
      for (const p of props) {
        if (p) {
          extraProps.add(p);
        }
      }
    }
    // Add variant dimension prop names
    for (const dim of d.variantDimensions ?? []) {
      extraProps.add(dim.propName);
    }
    // Add compound variant prop names
    for (const cv of d.compoundVariants ?? []) {
      extraProps.add(cv.outerProp);
      extraProps.add(cv.innerProp);
    }
    for (const p of d.styleFnFromProps ?? []) {
      if (p?.jsxProp && p.jsxProp !== "__props") {
        extraProps.add(p.jsxProp);
      }
    }
    for (const a of d.attrsInfo?.defaultAttrs ?? []) {
      if (a?.jsxProp) {
        extraProps.add(a.jsxProp);
      }
    }
    for (const c of d.attrsInfo?.conditionalAttrs ?? []) {
      if (c?.jsxProp) {
        extraProps.add(c.jsxProp);
      }
    }
    for (const inv of d.attrsInfo?.invertedBoolAttrs ?? []) {
      if (inv?.jsxProp) {
        extraProps.add(inv.jsxProp);
      }
    }
    const dropPrefixFromFilter = d.shouldForwardProp?.dropPrefix;
    const usedAttrs = emitter.getUsedAttrs(d.localName);
    const shouldAllowAnyPrefixProps =
      !!dropPrefixFromFilter &&
      (usedAttrs.has("*") ||
        [...usedAttrs].some((n) => n.startsWith(dropPrefixFromFilter) && !extraProps.has(n)));
    const isValidIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
    const knownPrefixProps = dropPrefixFromFilter
      ? [...extraProps].filter(
          (p: string) => p.startsWith(dropPrefixFromFilter) && isValidIdentifier(p),
        )
      : [];
    const knownPrefixPropsSet = new Set(knownPrefixProps);

    const explicit = emitter.stringifyTsType(d.propsType);
    // Extract prop names from explicit type to avoid duplicating them in inferred type
    const explicitPropNames = d.propsType
      ? emitter.getExplicitPropNames(d.propsType)
      : new Set<string>();
    const extrasTypeText = (() => {
      // If input provided an explicit props type, prefer it and avoid emitting `any` overrides
      // for the same keys (e.g. `color?: string` should not become `color?: any`).
      if (explicit && explicit.trim()) {
        // Only allow arbitrary `$...` transient props when we see unknown/spread attrs at call-sites.
        return dropPrefixFromFilter === "$" && shouldAllowAnyPrefixProps
          ? `${explicit} & { [K in \`$\${string}\`]?: any }`
          : explicit;
      }
      const lines: string[] = [];
      for (const p of extraProps) {
        // Only emit valid identifier keys (fixtures use simple identifiers like `hasError` / `$foo`).
        lines.push(`  ${p}?: any;`);
      }
      const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
      if (dropPrefixFromFilter === "$") {
        // Allow any `$...` transient prop when the filter is prefix-based.
        return `${literal} & { [K in \`$\${string}\`]?: any }`;
      }
      return literal;
    })();
    const finalTypeText = (() => {
      if (explicit) {
        // For non-exported components that only use transient props ($-prefixed),
        // use simple PropsWithChildren instead of verbose intersection type
        const isExported = d.isExported ?? false;
        const hasOnlyTransientCustomProps =
          !usedAttrs.has("*") && [...usedAttrs].every((n) => n === "children" || n.startsWith("$"));
        if (!isExported && hasOnlyTransientCustomProps && !VOID_TAGS.has(tagName)) {
          return emitter.withChildren(extrasTypeText);
        }
        if (VOID_TAGS.has(tagName)) {
          const base = emitter.reactIntrinsicAttrsType(tagName);
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          return emitter.joinIntersection(baseWithOmit, extrasTypeText);
        }
        const base = `React.ComponentProps<"${tagName}">`;
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        return emitter.joinIntersection(baseWithOmit, extrasTypeText);
      }
      const inferred = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });
      return VOID_TAGS.has(tagName) ? inferred : emitter.withChildren(inferred);
    })();

    const typeAliasEmitted = emitPropsType(d.localName, finalTypeText, allowAsProp);
    if (!typeAliasEmitted && explicit) {
      const propsTypeName = emitter.propsTypeNameFor(d.localName);
      const extendBaseTypeText = (() => {
        // Prefer ComponentProps for intrinsic wrappers so event handlers/attrs
        // are typed like real JSX usage (and so we can reliably omit className/style).
        const base = `React.ComponentProps<"${tagName}">`;
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      })();
      emitter.extendExistingType(propsTypeName, extendBaseTypeText);
    }
    needsReactTypeImport = true;

    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { cond, isBoolean } = emitter.collectConditionProps({ when: extra.when });
          styleArgs.push(
            emitter.makeConditionalStyleExpr({ cond, expr: extra.expr as any, isBoolean }),
          );
        } else {
          styleArgs.push(extra.expr as any);
        }
      }
    }

    // Collect keys used by compound variants (they're handled separately)
    const compoundVariantKeys = new Set<string>();
    for (const cv of d.compoundVariants ?? []) {
      compoundVariantKeys.add(cv.outerProp);
      compoundVariantKeys.add(`${cv.innerProp}True`);
      compoundVariantKeys.add(`${cv.innerProp}False`);
    }

    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      for (const [when, variantKey] of sortedEntries) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { cond, isBoolean } = emitter.collectConditionProps({ when });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Use makeConditionalStyleExpr to handle boolean vs non-boolean conditions correctly.
        // For boolean conditions, && is used. For non-boolean (could be "" or 0), ternary is used.
        styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean }));
      }
    }

    const dropProps = d.shouldForwardProp?.dropProps ?? [];

    // Extract props from variantStyleKeys and add to drop list for destructuring
    // This ensures variant props like $wrapLines are destructured from props
    if (d.variantStyleKeys) {
      for (const when of Object.keys(d.variantStyleKeys)) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { props } = emitter.collectConditionProps({ when });
        for (const p of props) {
          if (p && !dropProps.includes(p)) {
            dropProps.push(p);
          }
        }
      }
    }
    const dropPrefix = d.shouldForwardProp?.dropPrefix;

    // Initialize destructureParts and propDefaults early so buildVariantDimensionLookups can populate them
    const destructureParts: string[] = [];
    // Track default values for props (for destructuring defaults)
    const propDefaults = new Map<string, string>();
    for (const p of dropProps) {
      destructureParts.push(p);
    }

    // Collect props from extraStylexPropsArgs.when conditions
    // (extraStylexPropsArgs is processed earlier for styleArgs, but destructureParts wasn't available yet)
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { props } = emitter.collectConditionProps({ when: extra.when });
          for (const p of props) {
            if (p && !destructureParts.includes(p)) {
              destructureParts.push(p);
            }
          }
        }
      }
    }

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      // Pass destructureParts and propDefaults to track props and their defaults
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps: destructureParts,
        propDefaults,
      });
    }

    // Add compound variant expressions (multi-prop nested ternaries)
    if (d.compoundVariants) {
      buildCompoundVariantExpressions(d.compoundVariants, styleArgs, destructureParts);
    }

    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const prefix = dropPrefix;
      const isPrefixProp =
        !!prefix &&
        typeof p.jsxProp === "string" &&
        p.jsxProp !== "__props" &&
        p.jsxProp.startsWith(prefix);
      const propExpr = isPrefixProp
        ? knownPrefixPropsSet.has(p.jsxProp)
          ? j.identifier(p.jsxProp)
          : j.memberExpression(j.identifier("props"), j.literal(p.jsxProp), true)
        : p.jsxProp === "__props"
          ? j.identifier("props")
          : j.identifier(p.jsxProp);
      const callArg = p.callArg ?? propExpr;
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [callArg],
      );
      if (p.conditionWhen) {
        const { cond, isBoolean } = emitter.collectConditionProps({ when: p.conditionWhen });
        styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: call, isBoolean }));
        continue;
      }
      const isRequired =
        p.jsxProp === "__props" || emitter.isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      styleArgs.push(
        buildStyleFnConditionExpr({ j, condition: p.condition, propExpr, call, isRequired }),
      );
    }
    for (const p of knownPrefixProps) {
      if (!destructureParts.includes(p)) {
        destructureParts.push(p);
      }
    }
    for (const a of d.attrsInfo?.defaultAttrs ?? []) {
      if (a?.jsxProp && !destructureParts.includes(a.jsxProp)) {
        destructureParts.push(a.jsxProp);
      }
    }
    for (const c of d.attrsInfo?.conditionalAttrs ?? []) {
      if (c?.jsxProp && !destructureParts.includes(c.jsxProp)) {
        destructureParts.push(c.jsxProp);
      }
    }
    for (const inv of d.attrsInfo?.invertedBoolAttrs ?? []) {
      if (inv?.jsxProp && !destructureParts.includes(inv.jsxProp)) {
        destructureParts.push(inv.jsxProp);
      }
    }

    const propsParamId = j.identifier("props");
    emitter.annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");
    const isVoidTag = tagName === "input";
    const { hasAny: hasLocalUsage } = emitter.getJsxCallsites(d.localName);

    const shouldIncludeRest = shouldIncludeRestForProps({
      usedAsValue: emitter.isUsedAsValueInFile(d.localName),
      hasLocalUsage,
      usedAttrs,
      destructureProps: destructureParts,
      ignoreTransientAttrs: true,
    });

    // Skip rest spread omission for exported components - external consumers may pass additional props
    const isExportedComponent = d.isExported || emitter.exportedComponents.has(d.localName);
    const shouldOmitRestSpread =
      !isExportedComponent &&
      !dropPrefix &&
      dropProps.length > 0 &&
      dropProps.every((p: string) => p.startsWith("$")) &&
      !usedAttrs.has("*") &&
      [...usedAttrs].every((n) => n === "children" || dropProps.includes(n));
    const includeRest = !shouldOmitRestSpread && shouldIncludeRest;

    if (!allowClassNameProp && !allowStyleProp) {
      const isVoid = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildrenInner = allowAsProp || !isVoid;
      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(allowAsProp ? [asDestructureProp(tagName)] : []),
          ...(includeChildrenInner ? [patternProp("children", childrenId)] : []),
        ],
        destructureProps: destructureParts,
        propDefaults,
        includeRest,
        restId,
      });
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      const cleanupPrefixStmt =
        dropPrefix && shouldAllowAnyPrefixProps && includeRest
          ? (j.forOfStatement(
              j.variableDeclaration("const", [
                j.variableDeclarator(j.identifier("k"), null as any),
              ]),
              j.callExpression(j.memberExpression(j.identifier("Object"), j.identifier("keys")), [
                restId,
              ]),
              j.blockStatement([
                j.ifStatement(
                  j.callExpression(
                    j.memberExpression(j.identifier("k"), j.identifier("startsWith")),
                    [j.literal(dropPrefix)],
                  ),
                  j.expressionStatement(
                    j.unaryExpression(
                      "delete",
                      j.memberExpression(restId, j.identifier("k"), true),
                    ),
                  ),
                ),
              ]),
            ) as any)
          : null;

      const merging = emitStyleMerging({
        j,
        emitter,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: d.attrsInfo,
          propExprFor: (prop) => j.identifier(prop),
        }),
        ...(includeRest ? [j.jsxSpreadAttribute(restId)] : []),
      ];
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs: openingAttrs,
        includeChildren: includeChildrenInner,
        childrenExpr: childrenId,
      });

      const fnBodyStmts: StatementKind[] = [declStmt];
      if (cleanupPrefixStmt) {
        fnBodyStmts.push(cleanupPrefixStmt);
      }
      if (merging.sxDecl) {
        fnBodyStmts.push(merging.sxDecl);
      }
      fnBodyStmts.push(j.returnStatement(jsx as any));

      emitted.push(
        withLeadingComments(
          emitter.buildWrapperFunction({
            localName: d.localName,
            params: [propsParamId],
            bodyStmts: fnBodyStmts,
          }),
          d,
        ),
      );
      continue;
    }

    // When allowAsProp is true, include children support even for void tags
    // because the user might use `as="textarea"` which requires children
    const includeChildrenOuter = allowAsProp || !isVoidTag;
    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(tagName)] : []),
        ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
        ...(includeChildrenOuter ? [patternProp("children", childrenId)] : []),
        ...(allowStyleProp ? [patternProp("style", styleId)] : []),
      ],
      destructureProps: destructureParts,
      propDefaults,
      includeRest,
      restId,
    });

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    const cleanupPrefixStmt =
      dropPrefix && shouldAllowAnyPrefixProps && includeRest
        ? (j.forOfStatement(
            j.variableDeclaration("const", [j.variableDeclarator(j.identifier("k"), null as any)]),
            j.callExpression(j.memberExpression(j.identifier("Object"), j.identifier("keys")), [
              restId,
            ]),
            j.blockStatement([
              j.ifStatement(
                j.callExpression(
                  j.memberExpression(j.identifier("k"), j.identifier("startsWith")),
                  [j.literal(dropPrefix)],
                ),
                j.expressionStatement(
                  j.unaryExpression("delete", j.memberExpression(restId, j.identifier("k"), true)),
                ),
              ),
            ]),
          ) as any)
        : null;

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
    });

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: JsxAttr[] = [];
    if (includeRest) {
      openingAttrs.push(j.jsxSpreadAttribute(restId));
    }
    emitter.appendMergingAttrs(openingAttrs, merging);

    const jsx = emitter.buildJsxElement({
      tagName: allowAsProp ? "Component" : tagName,
      attrs: openingAttrs,
      includeChildren: includeChildrenOuter,
      childrenExpr: childrenId,
    });

    const fnBodyStmts: StatementKind[] = [declStmt];
    if (cleanupPrefixStmt) {
      fnBodyStmts.push(cleanupPrefixStmt);
    }
    if (merging.sxDecl) {
      fnBodyStmts.push(merging.sxDecl);
    }
    fnBodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      withLeadingComments(
        j.functionDeclaration(
          j.identifier(d.localName),
          [propsParamId],
          j.blockStatement(fnBodyStmts),
        ),
        d,
      ),
    );
  }

  // Simple wrappers for `withConfig({ componentId })` cases where we just want to
  // preserve a component boundary without prop filtering.
  const simpleWithConfigWrappers = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    const tagName = d.base.tagName;
    if (!d.withConfig?.componentId) {
      return false;
    }
    if (d.shouldForwardProp) {
      return false;
    }
    if (d.enumVariant) {
      return false;
    }
    if (d.siblingWrapper) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Don't duplicate the polymorphic wrapper path.
    if (wrapperNames.has(d.localName) || (d.supportsAsProp ?? false)) {
      return false;
    }
    // Avoid duplicating other specialized wrappers.
    if (tagName === "input" || tagName === "a") {
      return false;
    }
    return true;
  });

  for (const d of simpleWithConfigWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const supportsExternalStyles = d.supportsExternalStyles ?? false;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = shouldAllowAsProp(d, tagName);
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const shouldUseIntrinsicProps = (() => {
        if (supportsExternalStyles) {
          return true;
        }
        const used = emitter.getUsedAttrs(d.localName);
        if (used.has("*")) {
          return true;
        }
        // If any attribute is passed, prefer intrinsic props.
        return used.size > 0;
      })();
      const baseTypeText = shouldUseIntrinsicProps
        ? emitter.inferredIntrinsicPropsTypeText({
            d,
            tagName,
            allowClassNameProp,
            allowStyleProp,
          })
        : "{}";

      // Check if explicit type is a simple type reference that exists in the file
      // and if defaultAttrs reference element props - if so, extend the type with intrinsic props
      const explicitTypeName = emitter.getExplicitTypeNameIfExists(d.propsType);
      const needsElementProps = hasElementPropsInDefaultAttrs(d);

      if (explicitTypeName && explicit && needsElementProps) {
        // Extend the existing type with intrinsic element props so that element props
        // like tabIndex are available (when used in defaultAttrs like `tabIndex: props.tabIndex ?? 0`)
        const intrinsicBaseType = emitter.inferredIntrinsicPropsTypeText({
          d,
          tagName,
          allowClassNameProp,
          allowStyleProp,
        });
        emitter.extendExistingType(explicitTypeName, intrinsicBaseType);
        needsReactTypeImport = true;
        emitPropsType(d.localName, explicit, allowAsProp);
      } else {
        // For non-void tags without explicit type, wrap in PropsWithChildren
        const typeWithChildren =
          !explicit && !VOID_TAGS.has(tagName) ? emitter.withChildren(baseTypeText) : baseTypeText;
        const typeText = explicit ?? typeWithChildren;
        emitPropsType(d.localName, typeText, allowAsProp);
      }
    }
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    const propsParamId = j.identifier("props");
    emitter.annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

    // For local-only wrappers with no external `className`/`style` usage, keep the wrapper minimal.
    if (!allowClassNameProp && !allowStyleProp) {
      const usedAttrs = emitter.getUsedAttrs(d.localName);
      // Include rest spread when:
      // - Component is used with spread (usedAttrs.has("*"))
      // - Component is used as a value
      // - Component is not exported and has used attrs
      // - defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0)
      //   which means user should be able to pass/override these props
      const includeRest =
        usedAttrs.has("*") ||
        !!d.usedAsValue ||
        (!(d.isExported ?? false) && usedAttrs.size > 0) ||
        hasElementPropsInDefaultAttrs(d);
      const variantProps = new Set<string>();
      if (d.variantStyleKeys) {
        for (const [when] of Object.entries(d.variantStyleKeys)) {
          const { props } = emitter.collectConditionProps({ when });
          for (const p of props) {
            if (p) {
              variantProps.add(p);
            }
          }
        }
      }
      // Add variant dimension prop names
      for (const dim of d.variantDimensions ?? []) {
        variantProps.add(dim.propName);
      }
      // Add compound variant prop names
      for (const cv of d.compoundVariants ?? []) {
        variantProps.add(cv.outerProp);
        variantProps.add(cv.innerProp);
      }
      const extraProps = new Set<string>();
      if (d.extraStylexPropsArgs) {
        for (const extra of d.extraStylexPropsArgs) {
          if (!extra.when) {
            continue;
          }
          const { props } = emitter.collectConditionProps({ when: extra.when });
          for (const p of props) {
            if (p) {
              extraProps.add(p);
            }
          }
        }
      }
      const inlineProps = new Set(collectInlineStylePropNames(d.inlineStyleProps ?? []));
      const styleFnProps = new Set(
        (d.styleFnFromProps ?? [])
          .map((p: any) => p.jsxProp)
          .filter((name: string) => name && name !== "__props"),
      );
      const destructureProps = [
        ...new Set<string>([
          ...variantProps,
          ...extraProps,
          ...inlineProps,
          ...styleFnProps,
          ...(d.attrsInfo?.conditionalAttrs ?? []).map((c: any) => c.jsxProp).filter(Boolean),
          ...(d.attrsInfo?.invertedBoolAttrs ?? []).map((inv: any) => inv.jsxProp).filter(Boolean),
        ]),
      ];
      emitted.push(
        ...withLeadingCommentsOnFirstFunction(
          emitMinimalWrapper({
            j,
            localName: d.localName,
            tagName,
            propsTypeName: emitter.propsTypeNameFor(d.localName),
            emitTypes,
            styleArgs,
            destructureProps,
            allowAsProp,
            allowClassNameProp: false,
            allowStyleProp: false,
            includeRest,
            patternProp,
            defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
            conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
            invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
            staticAttrs: d.attrsInfo?.staticAttrs ?? {},
            inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
            styleMerger,
          }),
          d,
        ),
      );
      continue;
    }

    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(tagName)] : []),
        patternProp("className", classNameId),
        ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
        patternProp("style", styleId),
      ],
      destructureProps: [],
      includeRest: true,
      restId,
    });
    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
    });

    const openingAttrs: JsxAttr[] = [
      ...emitter.buildAttrsFromAttrsInfo({
        attrsInfo: d.attrsInfo,
        propExprFor: (prop) => j.identifier(prop),
      }),
      j.jsxSpreadAttribute(restId),
    ];
    emitter.appendMergingAttrs(openingAttrs, merging);

    const openingEl = j.jsxOpeningElement(
      j.jsxIdentifier(allowAsProp ? "Component" : tagName),
      openingAttrs,
      false,
    );

    const jsx = isVoidTag
      ? ({
          type: "JSXElement",
          openingElement: { ...openingEl, selfClosing: true },
          closingElement: null,
          children: [],
        } as any)
      : j.jsxElement(
          openingEl,
          j.jsxClosingElement(j.jsxIdentifier(allowAsProp ? "Component" : tagName)),
          [j.jsxExpressionContainer(childrenId)],
        );

    const bodyStmts: StatementKind[] = [declStmt];
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      withLeadingComments(
        emitter.buildWrapperFunction({
          localName: d.localName,
          params: [propsParamId],
          bodyStmts,
        }),
        d,
      ),
    );
  }

  // Sibling selector wrappers (Thing + variants)
  const siblingWrappers = wrapperDecls.filter((d: StyledDecl) => d.siblingWrapper);
  for (const d of siblingWrappers) {
    if (d.base.kind !== "intrinsic" || d.base.tagName !== "div") {
      continue;
    }
    const sw = d.siblingWrapper!;
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
      emitPropsType(d.localName, typeText, allowAsProp);
    }

    const propsParamId = j.identifier("props");
    emitter.annotatePropsParam(propsParamId, d.localName);
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
          patternProp("children", childrenId),
          patternProp("className", classNameId),
          patternProp(sw.propAdjacent, adjId),
          patternProp(afterId.name, afterId),
          j.restElement(restId),
        ] as any),
        propsId,
      ),
    ]);

    // Build styleArgs for sibling selectors
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgsFor(d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
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
      }),
    );
  }

  // Simple exported styled components (styled.div without special features)
  // These are exported components that need wrapper generation to maintain exports.
  const simpleExportedIntrinsicWrappers = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip if already handled by other wrapper categories
    if (d.withConfig?.componentId) {
      return false;
    }
    if (d.shouldForwardProp) {
      return false;
    }
    if (d.enumVariant) {
      return false;
    }
    if (d.siblingWrapper) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Skip specialized wrapper categories (polymorphic intrinsic wrappers)
    if (wrapperNames.has(d.localName) || (d.supportsAsProp ?? false)) {
      return false;
    }
    // Note: input/a tags without attrWrapper (e.g., simple .attrs() cases) are now
    // handled here. The attrWrapper case is already excluded above.
    return true;
  });
  for (const d of simpleExportedIntrinsicWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const usedAttrsForType = emitter.getUsedAttrs(d.localName);
    const allowAsProp = shouldAllowAsProp(d, tagName);
    let inlineTypeText: string | undefined;
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const explicitPropNames = d.propsType
        ? emitter.getExplicitPropNames(d.propsType)
        : new Set<string>();
      const baseTypeText = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });

      const variantPropsForType = new Set([
        ...Object.keys(d.variantStyleKeys ?? {}).flatMap((when: string) => {
          return when.split("&&").flatMap((part: string) => {
            const cleanPart = part.replace(/^!/, "");
            const colonIdx = cleanPart.indexOf(":");
            return colonIdx >= 0 ? [cleanPart.slice(0, colonIdx)] : [cleanPart];
          });
        }),
        // Add variant dimension prop names
        ...(d.variantDimensions ?? []).map((dim) => dim.propName),
        // Add compound variant prop names
        ...(d.compoundVariants ?? []).flatMap((cv) => [cv.outerProp, cv.innerProp]),
      ]);
      const styleFnPropsForType = new Set(
        (d.styleFnFromProps ?? [])
          .map((p: any) => p.jsxProp)
          .filter((name: string) => name !== "__props"),
      );
      const conditionalPropsForType = new Set(
        (d.attrsInfo?.conditionalAttrs ?? []).map((c: any) => c.jsxProp),
      );
      const invertedPropsForType = new Set(
        (d.attrsInfo?.invertedBoolAttrs ?? []).map((inv: any) => inv.jsxProp),
      );
      const staticAttrNames = new Set(Object.keys(d.attrsInfo?.staticAttrs ?? {}));
      const handledProps = new Set([
        ...variantPropsForType,
        ...styleFnPropsForType,
        ...conditionalPropsForType,
        ...invertedPropsForType,
        ...staticAttrNames,
      ]);
      const needsRestForType =
        !!d.usedAsValue ||
        usedAttrsForType.has("*") ||
        // When defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0),
        // include element props in type so those props are available
        hasElementPropsInDefaultAttrs(d) ||
        [...usedAttrsForType].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs" ||
            n.startsWith("$")
          ) {
            return false;
          }
          return !handledProps.has(n);
        });

      const extendBaseTypeText = (() => {
        // Prefer ComponentProps for intrinsic wrappers so event handlers/attrs
        // are typed like real JSX usage (and so we can reliably omit className/style).
        const base = `React.ComponentProps<"${tagName}">`;
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      })();

      const customStyleDrivingPropsTypeText = (() => {
        // These are props that influence styles/attrs and are consumed by the wrapper.
        // They are often not part of intrinsic element props (e.g. `hasError`, `$size`),
        // so we keep them in the public props type even when we otherwise rely on
        // React's intrinsic props typing for pass-through props.
        const keys = new Set<string>();
        const addIfString = (k: unknown) => {
          if (typeof k === "string") {
            keys.add(k);
          }
        };
        for (const k of variantPropsForType as Set<unknown>) {
          addIfString(k);
        }
        for (const k of styleFnPropsForType as Set<unknown>) {
          addIfString(k);
        }
        for (const k of conditionalPropsForType as Set<unknown>) {
          addIfString(k);
        }
        for (const k of invertedPropsForType as Set<unknown>) {
          addIfString(k);
        }
        const filtered = [...keys].filter(
          (k) =>
            k &&
            k !== "children" &&
            k !== "className" &&
            k !== "style" &&
            k !== "as" &&
            k !== "forwardedAs",
        );
        if (filtered.length === 0) {
          return "{}";
        }
        const lines = filtered.map((k) => `  ${k}?: any;`);
        return `{\n${lines.join("\n")}\n}`;
      })();

      const typeText = (() => {
        if (!explicit) {
          // If we forward `...rest`, prefer full intrinsic props typing so common
          // props (e.g. onChange) get correct types. Keep any style-driving custom
          // props intersected in so the wrapper can consume them.
          return needsRestForType
            ? emitter.joinIntersection(extendBaseTypeText, customStyleDrivingPropsTypeText)
            : baseTypeText;
        }
        if (VOID_TAGS.has(tagName)) {
          return emitter.joinIntersection(extendBaseTypeText, explicit);
        }
        if (needsRestForType) {
          // For non-exported components that only use transient props ($-prefixed),
          // use simple PropsWithChildren instead of verbose intersection type
          const isExported = d.isExported ?? false;
          const hasOnlyTransientCustomProps =
            !usedAttrsForType.has("*") &&
            [...usedAttrsForType].every((n) => n === "children" || n.startsWith("$"));
          if (!isExported && hasOnlyTransientCustomProps) {
            return emitter.withChildren(explicit);
          }
          return emitter.joinIntersection(extendBaseTypeText, explicit);
        }
        if (allowClassNameProp || allowStyleProp) {
          const extras: string[] = [];
          if (allowClassNameProp) {
            extras.push("className?: string");
          }
          if (allowStyleProp) {
            extras.push("style?: React.CSSProperties");
          }
          extras.push("children?: React.ReactNode");
          return emitter.joinIntersection(explicit, `{ ${extras.join("; ")} }`);
        }
        return emitter.withChildren(explicit);
      })();
      const asPropTypeText = allowAsProp ? "{ as?: React.ElementType }" : null;
      const mergedPropsWithChildren = allowAsProp ? mergeAsIntoPropsWithChildren(typeText) : null;
      const typeWithAs = mergedPropsWithChildren
        ? mergedPropsWithChildren
        : asPropTypeText
          ? emitter.joinIntersection(typeText, asPropTypeText)
          : typeText;
      // Check if explicit type is a simple type reference (e.g., `Props`) that exists in the file
      const explicitTypeName = emitter.getExplicitTypeNameIfExists(d.propsType);

      let typeAliasEmitted = false;
      const needsElementPropsForAttrs = hasElementPropsInDefaultAttrs(d);
      // When the explicit type exists and defaultAttrs reference element props
      // (like tabIndex: props.tabIndex ?? 0), extend the explicit type directly
      if (explicitTypeName && needsElementPropsForAttrs) {
        emitter.extendExistingType(explicitTypeName, extendBaseTypeText);
        // Also extend with as prop if needed
        if (asPropTypeText) {
          emitter.extendExistingType(explicitTypeName, asPropTypeText);
        }
        // Use the explicit type wrapped in PropsWithChildren for the function parameter
        // explicit is guaranteed to be truthy here since explicitTypeExists is true
        inlineTypeText = VOID_TAGS.has(tagName)
          ? (explicit ?? undefined)
          : emitter.withChildren(explicit!);
        // Note: Don't add asPropTypeText to inlineTypeText since it's already in the explicit type
      } else {
        typeAliasEmitted = emitNamedPropsType(d.localName, typeWithAs);
        if (!typeAliasEmitted && explicit) {
          const propsTypeName = emitter.propsTypeNameFor(d.localName);
          const typeExtended = emitter.extendExistingType(propsTypeName, extendBaseTypeText);
          if (!typeExtended) {
            inlineTypeText = VOID_TAGS.has(tagName) ? explicit : emitter.withChildren(explicit);
            if (asPropTypeText) {
              inlineTypeText = emitter.joinIntersection(inlineTypeText, asPropTypeText);
            }
          }
        }
      }
      if (!typeAliasEmitted && asPropTypeText) {
        addAsPropToExistingType(emitter.propsTypeNameFor(d.localName));
      }
      needsReactTypeImport = true;
    }
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    const destructureProps: string[] = [];
    // Track default values for props (for destructuring defaults)
    const propDefaults = new Map<string, string>();

    // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { cond, isBoolean } = emitter.collectConditionProps({
            when: extra.when,
            destructureProps,
          });
          styleArgs.push(
            emitter.makeConditionalStyleExpr({ cond, expr: extra.expr as any, isBoolean }),
          );
        } else {
          styleArgs.push(extra.expr as any);
        }
      }
    }
    // Collect keys used by compound variants (they're handled separately)
    const compoundVariantKeys = new Set<string>();
    for (const cv of d.compoundVariants ?? []) {
      compoundVariantKeys.add(cv.outerProp);
      compoundVariantKeys.add(`${cv.innerProp}True`);
      compoundVariantKeys.add(`${cv.innerProp}False`);
    }

    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      for (const [when, variantKey] of sortedEntries) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { cond, isBoolean } = emitter.collectConditionProps({ when, destructureProps });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Use makeConditionalStyleExpr to handle boolean vs non-boolean conditions correctly.
        // For boolean conditions, && is used. For non-boolean (could be "" or 0), ternary is used.
        styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean }));
      }
    }

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps,
        propDefaults,
      });
    }

    // Add compound variant expressions (multi-prop nested ternaries)
    if (d.compoundVariants) {
      buildCompoundVariantExpressions(d.compoundVariants, styleArgs, destructureProps);
    }

    for (const prop of collectInlineStylePropNames(d.inlineStyleProps ?? [])) {
      if (!destructureProps.includes(prop)) {
        destructureProps.push(prop);
      }
    }

    // Add style function calls for dynamic prop-based styles
    emitter.buildStyleFnExpressions({
      d,
      styleArgs,
      destructureProps,
    });
    emitter.collectDestructurePropsFromStyleFns({ d, styleArgs, destructureProps });

    if (d.attrsInfo?.conditionalAttrs?.length) {
      for (const c of d.attrsInfo.conditionalAttrs) {
        if (c?.jsxProp && !destructureProps.includes(c.jsxProp)) {
          destructureProps.push(c.jsxProp);
        }
      }
    }
    if (d.attrsInfo?.invertedBoolAttrs?.length) {
      for (const inv of d.attrsInfo.invertedBoolAttrs) {
        if (inv?.jsxProp && !destructureProps.includes(inv.jsxProp)) {
          destructureProps.push(inv.jsxProp);
        }
      }
    }

    // Extract transient props (starting with $) from the explicit type.
    // Only destructure them when we actually spread `rest` into the element.
    const explicitTransientProps: string[] = [];
    const explicit = d.propsType;
    if (explicit?.type === "TSTypeLiteral" && explicit.members) {
      for (const member of explicit.members as any[]) {
        if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
          const name = member.key.name;
          if (name.startsWith("$")) {
            explicitTransientProps.push(name);
          }
        }
      }
    }
    const usedAttrs = emitter.getUsedAttrs(d.localName);
    const { hasAny: hasLocalUsage } = emitter.getJsxCallsites(d.localName);
    const explicitPropsNames = d.propsType
      ? emitter.getExplicitPropNames(d.propsType)
      : new Set<string>();
    const hasExplicitPropsToPassThrough =
      explicitPropsNames.size > 0 &&
      [...explicitPropsNames].some((n) => {
        if (
          n === "children" ||
          n === "className" ||
          n === "style" ||
          n === "as" ||
          n === "forwardedAs" ||
          n.startsWith("$")
        ) {
          return false;
        }
        return !destructureProps.includes(n);
      });
    let shouldIncludeRest = shouldIncludeRestForProps({
      usedAsValue: emitter.isUsedAsValueInFile(d.localName),
      hasLocalUsage,
      usedAttrs,
      destructureProps,
      hasExplicitPropsToPassThrough,
      ignoreTransientAttrs: true,
    });
    // When defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0),
    // include rest spread so user can pass/override these props
    if (hasElementPropsInDefaultAttrs(d)) {
      shouldIncludeRest = true;
    }
    if (shouldIncludeRest) {
      for (const name of explicitTransientProps) {
        if (!destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
    }

    if (allowAsProp || allowClassNameProp || allowStyleProp) {
      const isVoidTag = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildren = allowAsProp || !isVoidTag;
      const propsParamId = j.identifier("props");
      emitter.annotatePropsParam(propsParamId, d.localName, inlineTypeText);
      const propsId = j.identifier("props");
      const componentId = j.identifier("Component");
      const classNameId = j.identifier("className");
      const childrenId = j.identifier("children");
      const styleId = j.identifier("style");
      const restId = shouldIncludeRest ? j.identifier("rest") : null;

      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(allowAsProp
            ? [
                j.property.from({
                  kind: "init",
                  key: j.identifier("as"),
                  value: j.assignmentPattern(componentId, j.literal(tagName)),
                  shorthand: false,
                }),
              ]
            : []),
          ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
          ...(includeChildren ? [patternProp("children", childrenId)] : []),
          ...(allowStyleProp ? [patternProp("style", styleId)] : []),
        ],
        destructureProps,
        propDefaults,
        includeRest: Boolean(restId),
        restId: restId ?? undefined,
      });
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      // Use the style merger helper
      const merging = emitStyleMerging({
        j,
        emitter,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: d.attrsInfo,
          propExprFor: (prop) => j.identifier(prop),
        }),
        ...(restId ? [j.jsxSpreadAttribute(restId)] : []),
      ];
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs: openingAttrs,
        includeChildren,
        childrenExpr: childrenId,
      });

      const bodyStmts: StatementKind[] = [declStmt];
      if (merging.sxDecl) {
        bodyStmts.push(merging.sxDecl);
      }
      bodyStmts.push(j.returnStatement(jsx as any));

      emitted.push(
        ...withLeadingCommentsOnFirstFunction(
          [
            emitter.buildWrapperFunction({
              localName: d.localName,
              params: [propsParamId],
              bodyStmts,
            }),
          ],
          d,
        ),
      );
      continue;
    }

    emitted.push(
      ...withLeadingCommentsOnFirstFunction(
        emitMinimalWrapper({
          j,
          localName: d.localName,
          tagName,
          propsTypeName: emitter.propsTypeNameFor(d.localName),
          ...(inlineTypeText ? { inlineTypeText } : {}),
          emitTypes,
          styleArgs,
          destructureProps,
          propDefaults,
          allowAsProp,
          allowClassNameProp: false,
          allowStyleProp: false,
          includeRest: shouldIncludeRest,
          patternProp,
          defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
          conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
          invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
          staticAttrs: d.attrsInfo?.staticAttrs ?? {},
          inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
          styleMerger,
        }),
        d,
      ),
    );
  }

  // --- END extracted blocks ---

  return { emitted, needsReactTypeImport };
}
