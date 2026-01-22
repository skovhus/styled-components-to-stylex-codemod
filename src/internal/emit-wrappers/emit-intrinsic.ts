import type { ASTNode } from "jscodeshift";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import { emitStyleMerging, type StyleMergerConfig } from "./style-merger.js";
import { collectInlineStylePropNames, type ExpressionKind, type InlineStyleProp } from "./types.js";

export function emitIntrinsicWrappers(ctx: any): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
} {
  const {
    root,
    j,
    emitTypes,
    wrapperDecls,
    wrapperNames,
    stylesIdentifier,
    getUsedAttrs,
    getJsxCallsites,
    isUsedAsValueInFile,
    shouldAllowClassNameProp,
    shouldAllowStyleProp,
    stringifyTsType,
    emitNamedPropsType,
    withChildren,
    joinIntersection,
    parseVariantWhenToAst,
    annotatePropsParam,
    propsTypeNameFor,
    inferredIntrinsicPropsTypeText,
    typeExistsInFile,
    extendExistingInterface,
    extendExistingTypeAlias,
    getExplicitPropNames,
    isPropRequiredInPropsTypeLiteral,
    reactIntrinsicAttrsType,
    VOID_TAGS,
    patternProp,
    withLeadingComments,
    emitMinimalWrapper,
    withLeadingCommentsOnFirstFunction,
    styleMerger,
  } = ctx as { styleMerger: StyleMergerConfig | null; wrapperDecls: StyledDecl[] } & Record<
    string,
    any
  >;

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  const extraStyleArgsFor = (d: StyledDecl): ExpressionKind[] =>
    (d.extraStyleKeys ?? []).map((key) =>
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key)),
    );

  /**
   * Build variant dimension lookup expressions for StyleX variants recipe pattern.
   * Generates: variantsObj[prop as keyof typeof variantsObj] ?? variantsObj.default
   *
   * @param dimensions - Variant dimensions to process
   * @param styleArgs - Array to push generated expressions into
   * @param destructureProps - Optional array to track props that need destructuring
   * @param propDefaults - Optional map to populate with default values for props (for destructuring)
   */
  const buildVariantDimensionLookups = (
    dimensions: VariantDimension[],
    styleArgs: ExpressionKind[],
    destructureProps?: string[],
    propDefaults?: Map<string, string>,
  ): void => {
    // Group namespace dimensions by their boolean prop and propName
    const namespacePairs = new Map<
      string,
      { enabled?: VariantDimension; disabled?: VariantDimension }
    >();
    const regularDimensions: VariantDimension[] = [];

    for (const dim of dimensions) {
      if (dim.namespaceBooleanProp) {
        const key = `${dim.namespaceBooleanProp}:${dim.propName}`;
        const pair = namespacePairs.get(key) ?? {};
        if (dim.isDisabledNamespace) {
          pair.disabled = dim;
        } else {
          pair.enabled = dim;
        }
        namespacePairs.set(key, pair);
      } else {
        regularDimensions.push(dim);
      }
    }

    // Process regular (non-namespace) dimensions first
    for (const dim of regularDimensions) {
      if (destructureProps && !destructureProps.includes(dim.propName)) {
        destructureProps.push(dim.propName);
      }
      const variantsId = j.identifier(dim.variantObjectName);
      const propId = j.identifier(dim.propName);

      if (dim.defaultValue === "default") {
        // When defaultValue is "default", the variant object has a "default" key that doesn't
        // match any prop type value. We need:
        // 1. A cast: prop as keyof typeof variantsObj (to satisfy TypeScript)
        // 2. A fallback: ?? variantsObj.default (for prop values not in the object)
        const keyofExpr = {
          type: "TSTypeOperator",
          operator: "keyof",
          typeAnnotation: j.tsTypeQuery(j.identifier(dim.variantObjectName)),
        };
        const castProp = j.tsAsExpression(propId, keyofExpr as any);
        const lookup = j.memberExpression(variantsId, castProp, true /* computed */);
        const defaultAccess = j.memberExpression(
          j.identifier(dim.variantObjectName),
          j.identifier("default"),
        );
        styleArgs.push(j.logicalExpression("??", lookup, defaultAccess));
      } else {
        // When defaultValue is an actual prop value (not "default"), all union values are
        // covered in the variant object. We can use a simple lookup without cast or fallback:
        // variantsObj[prop]
        // Track the default for destructuring - only for optional props to ensure type safety
        if (dim.defaultValue && dim.isOptional && propDefaults) {
          propDefaults.set(dim.propName, dim.defaultValue);
        }
        const lookup = j.memberExpression(variantsId, propId, true /* computed */);
        styleArgs.push(lookup);
      }
    }

    // Process namespace dimension pairs - emit ternary: boolProp ? disabledVariants[prop] : enabledVariants[prop]
    for (const [, pair] of namespacePairs) {
      const { enabled, disabled } = pair;
      if (!enabled || !disabled) {
        // Incomplete pair - emit each dimension separately as fallback
        for (const dim of [enabled, disabled].filter(Boolean) as VariantDimension[]) {
          if (destructureProps && !destructureProps.includes(dim.propName)) {
            destructureProps.push(dim.propName);
          }
          const lookup = j.memberExpression(
            j.identifier(dim.variantObjectName),
            j.identifier(dim.propName),
            true,
          );
          styleArgs.push(lookup);
        }
        continue;
      }

      // Add props to destructure list and track defaults
      if (destructureProps) {
        if (!destructureProps.includes(enabled.propName)) {
          destructureProps.push(enabled.propName);
        }
        if (!destructureProps.includes(enabled.namespaceBooleanProp!)) {
          destructureProps.push(enabled.namespaceBooleanProp!);
        }
      }

      // Track defaults for destructuring - only for optional props to ensure type safety
      if (
        enabled.defaultValue &&
        enabled.defaultValue !== "default" &&
        enabled.isOptional &&
        propDefaults
      ) {
        propDefaults.set(enabled.propName, enabled.defaultValue);
      }

      // Build: boolProp ? disabledVariants[prop] : enabledVariants[prop]
      const boolPropId = j.identifier(enabled.namespaceBooleanProp!);
      const propId = j.identifier(enabled.propName);

      const enabledLookup = j.memberExpression(
        j.identifier(enabled.variantObjectName),
        propId,
        true,
      );
      const disabledLookup = j.memberExpression(
        j.identifier(disabled.variantObjectName),
        propId,
        true,
      );

      styleArgs.push(j.conditionalExpression(boolPropId, disabledLookup, enabledLookup));
    }
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

  const inputWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "input" && d.attrWrapper?.kind === "input",
  );
  const linkWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) =>
      d.base.kind === "intrinsic" && d.base.tagName === "a" && d.attrWrapper?.kind === "link",
  );
  const intrinsicPolymorphicWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) => d.base.kind === "intrinsic" && wrapperNames.has(d.localName),
  );
  const shouldForwardPropWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) => d.shouldForwardProp && !d.enumVariant && d.base.kind === "intrinsic",
  );

  // --- BEGIN extracted blocks from `emit-wrappers.ts` (kept mechanically identical) ---

  if (inputWrapperDecls.length > 0) {
    for (const d of inputWrapperDecls) {
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
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
      );
      needsReactTypeImport = true;

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
          ? emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
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
          : emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
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
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const explicit = stringifyTsType(d.propsType);
      emitNamedPropsType(
        d.localName,
        explicit ??
          withChildren(
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
      );
      needsReactTypeImport = true;

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
          ? emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
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
          : emitTypes
            ? (j.template.statement`
                function ${j.identifier(d.localName)}(props: ${j.identifier(propsTypeNameFor(d.localName))}) {
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
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const allowAsProp = !VOID_TAGS.has(tagName);
      const explicit = stringifyTsType(d.propsType);

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
        const used = getUsedAttrs(d.localName);
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
        return joinIntersection(baseMaybeOmitted, "{ as?: C }");
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
        for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
          // Skip keys handled by compound variants
          if (compoundVariantKeys.has(when)) {
            continue;
          }
          const { cond, props } = parseVariantWhenToAst(j, when);
          for (const p of props) {
            if (p && !destructureProps.includes(p)) {
              destructureProps.push(p);
            }
          }
          styleArgs.push(
            j.logicalExpression(
              "&&",
              cond,
              j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
            ),
          );
        }
      }

      // Add variant dimension lookups (StyleX variants recipe pattern)
      if (d.variantDimensions) {
        buildVariantDimensionLookups(
          d.variantDimensions,
          styleArgs,
          destructureProps,
          propDefaults,
        );
      }

      // Add compound variant expressions (multi-prop nested ternaries)
      if (d.compoundVariants) {
        buildCompoundVariantExpressions(d.compoundVariants, styleArgs, destructureProps);
      }

      // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
      if (d.extraStylexPropsArgs) {
        for (const extra of d.extraStylexPropsArgs) {
          if (extra.when) {
            const { cond, props } = parseVariantWhenToAst(j, extra.when);
            for (const p of props) {
              if (p && !destructureProps.includes(p)) {
                destructureProps.push(p);
              }
            }
            styleArgs.push(j.logicalExpression("&&", cond, extra.expr as any));
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

      const isVoidTag = VOID_TAGS.has(tagName);
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
            `const x: ${propsTypeNameFor(d.localName)}<C> = null`,
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
            ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
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
        styleMerger,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: [],
      });

      const attrs: ASTNode[] = [
        j.jsxSpreadAttribute(restId),
        j.jsxSpreadAttribute(merging.jsxSpreadExpr),
      ];
      if (merging.classNameAttr) {
        attrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("className"),
            j.jsxExpressionContainer(merging.classNameAttr),
          ),
        );
      }
      if (merging.styleAttr) {
        attrs.push(
          j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
        );
      }
      const openingEl = j.jsxOpeningElement(
        j.jsxIdentifier(allowAsProp ? "Component" : tagName),
        attrs,
        isVoidTag,
      );
      const jsx = isVoidTag
        ? ({
            type: "JSXElement",
            openingElement: openingEl,
            closingElement: null,
            children: [],
          } as any)
        : j.jsxElement(
            openingEl,
            j.jsxClosingElement(j.jsxIdentifier(allowAsProp ? "Component" : tagName)),
            [j.jsxExpressionContainer(childrenId)],
          );

      const fnBodyStmts: ASTNode[] = [declStmt];
      if (merging.sxDecl) {
        fnBodyStmts.push(merging.sxDecl);
      }
      fnBodyStmts.push(j.returnStatement(jsx as any));

      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement(fnBodyStmts),
      );
      // Move the generic parameters from the param to the function node (parser puts it on FunctionDeclaration).
      if ((propsParamId as any).typeParameters) {
        (fn as any).typeParameters = (propsParamId as any).typeParameters;
        (propsParamId as any).typeParameters = undefined;
      }
      emitted.push(fn);
    }
  }

  // Enum-variant wrappers (e.g. DynamicBox variant mapping from string-interpolation fixture).
  const enumVariantWrappers = wrapperDecls.filter((d: StyledDecl) => d.enumVariant);
  if (enumVariantWrappers.length > 0) {
    for (const d of enumVariantWrappers) {
      if (!d.enumVariant) {
        continue;
      }
      const { propName, baseKey, cases } = d.enumVariant;
      const primary = cases[0];
      const secondary = cases[1];
      if (!primary || !secondary) {
        continue;
      }
      const explicit = stringifyTsType(d.propsType);
      if (explicit) {
        emitNamedPropsType(d.localName, withChildren(explicit));
        needsReactTypeImport = true;
      } else {
        // Best-effort: treat enum variant prop as a string-literal union.
        const hasNeq = cases.some((c) => c.kind === "neq");
        const values = [...new Set(cases.map((c) => c.whenValue))].filter(Boolean);
        const union = hasNeq
          ? "string"
          : values.length > 0
            ? values.map((v) => JSON.stringify(v)).join(" | ")
            : "string";
        emitNamedPropsType(
          d.localName,
          withChildren(`React.HTMLAttributes<HTMLDivElement> & { ${propName}?: ${union} }`),
        );
        needsReactTypeImport = true;
      }
      const propsParamId = j.identifier("props");
      annotatePropsParam(propsParamId, d.localName);
      const propsId = j.identifier("props");
      const variantId = j.identifier(propName);
      const childrenId = j.identifier("children");

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
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
        j.jsxIdentifier("div"),
        [j.jsxSpreadAttribute(j.identifier("sx"))],
        false,
      );
      const jsx = j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier("div")), [
        j.jsxExpressionContainer(childrenId),
      ]);

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
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);

    const extraProps = new Set<string>();
    for (const p of d.shouldForwardProp?.dropProps ?? []) {
      if (p) {
        extraProps.add(p);
      }
    }
    for (const when of Object.keys(d.variantStyleKeys ?? {})) {
      const { props } = parseVariantWhenToAst(j, when);
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
    const usedAttrs = getUsedAttrs(d.localName);
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

    const explicit = stringifyTsType(d.propsType);
    // Extract prop names from explicit type to avoid duplicating them in inferred type
    const explicitPropNames = d.propsType ? getExplicitPropNames(d.propsType) : new Set<string>();
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
        if (VOID_TAGS.has(tagName)) {
          const base = reactIntrinsicAttrsType(tagName);
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          return joinIntersection(baseWithOmit, extrasTypeText);
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
        return joinIntersection(baseWithOmit, extrasTypeText);
      }
      const inferred = inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });
      return VOID_TAGS.has(tagName) ? inferred : withChildren(inferred);
    })();

    const typeAliasEmitted = emitNamedPropsType(d.localName, finalTypeText);
    if (!typeAliasEmitted && explicit) {
      const propsTypeName = propsTypeNameFor(d.localName);
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
      const interfaceExtended = extendExistingInterface(propsTypeName, extendBaseTypeText);
      if (!interfaceExtended) {
        extendExistingTypeAlias(propsTypeName, extendBaseTypeText);
      }
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
          const { cond } = parseVariantWhenToAst(j, extra.when);
          styleArgs.push(j.logicalExpression("&&", cond, extra.expr as any));
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
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { cond } = parseVariantWhenToAst(j, when);
        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
          ),
        );
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
        const { props } = parseVariantWhenToAst(j, when);
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

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      // Pass destructureParts and propDefaults to track props and their defaults
      buildVariantDimensionLookups(d.variantDimensions, styleArgs, destructureParts, propDefaults);
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
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [propExpr],
      );
      if (p.condition === "truthy") {
        const truthy = j.unaryExpression("!", j.unaryExpression("!", propExpr));
        styleArgs.push(j.logicalExpression("&&", truthy, call));
        continue;
      }
      const required =
        p.jsxProp === "__props" || isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        styleArgs.push(
          j.logicalExpression("&&", j.binaryExpression("!=", propExpr, j.nullLiteral()), call),
        );
      }
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
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");
    const isVoidTag = tagName === "input";
    const { hasAny: hasLocalUsage } = getJsxCallsites(d.localName);

    const shouldIncludeRest =
      isUsedAsValueInFile(d.localName) ||
      (hasLocalUsage && usedAttrs.has("*")) ||
      (hasLocalUsage &&
        [...usedAttrs].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs"
          ) {
            return false;
          }
          return !destructureParts.includes(n);
        }));

    const shouldOmitRestSpread =
      !dropPrefix &&
      dropProps.length > 0 &&
      dropProps.every((p: string) => p.startsWith("$")) &&
      !usedAttrs.has("*") &&
      [...usedAttrs].every((n) => n === "children" || dropProps.includes(n));
    const includeRest = !shouldOmitRestSpread && shouldIncludeRest;

    if (!allowClassNameProp && !allowStyleProp) {
      const isVoid = VOID_TAGS.has(tagName);
      const patternProps: ASTNode[] = [
        ...(isVoid ? [] : [patternProp("children", childrenId)]),
        // Add props to destructuring (with defaults when available)
        ...destructureParts.filter(Boolean).map((name) => {
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
        ...(includeRest ? [j.restElement(restId)] : []),
      ];
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
        styleMerger,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      });

      const openingAttrs: ASTNode[] = [];
      for (const a of d.attrsInfo?.defaultAttrs ?? []) {
        const propExpr = j.identifier(a.jsxProp);
        const fallback =
          typeof a.value === "string"
            ? j.literal(a.value)
            : typeof a.value === "number"
              ? j.literal(a.value)
              : typeof a.value === "boolean"
                ? j.booleanLiteral(a.value)
                : j.literal(String(a.value));
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(a.attrName),
            j.jsxExpressionContainer(j.logicalExpression("??", propExpr, fallback as any)),
          ),
        );
      }
      for (const cond of d.attrsInfo?.conditionalAttrs ?? []) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(cond.attrName),
            j.jsxExpressionContainer(
              j.conditionalExpression(
                j.identifier(cond.jsxProp),
                j.literal(cond.value),
                j.identifier("undefined"),
              ),
            ),
          ),
        );
      }
      for (const inv of d.attrsInfo?.invertedBoolAttrs ?? []) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(inv.attrName),
            j.jsxExpressionContainer(
              j.binaryExpression("!==", j.identifier(inv.jsxProp), j.booleanLiteral(true)),
            ),
          ),
        );
      }
      for (const [key, value] of Object.entries(d.attrsInfo?.staticAttrs ?? {})) {
        if (typeof value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
        } else if (typeof value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(key),
              value ? null : j.jsxExpressionContainer(j.literal(false)),
            ),
          );
        } else if (typeof value === "number") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
          );
        }
      }
      if (includeRest) {
        openingAttrs.push(j.jsxSpreadAttribute(restId));
      }
      openingAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));
      if (merging.classNameAttr) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("className"),
            j.jsxExpressionContainer(merging.classNameAttr),
          ),
        );
      }
      if (merging.styleAttr) {
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
        );
      }

      const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), openingAttrs, false);
      const jsx = isVoid
        ? ({
            type: "JSXElement",
            openingElement: { ...openingEl, selfClosing: true },
            closingElement: null,
            children: [],
          } as any)
        : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
            j.jsxExpressionContainer(childrenId),
          ]);

      const fnBodyStmts: ASTNode[] = [declStmt];
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
      continue;
    }

    const patternProps: ASTNode[] = [
      ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
      ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
      ...(allowStyleProp ? [patternProp("style", styleId)] : []),
      // Add props to destructuring (with defaults when available)
      ...destructureParts.filter(Boolean).map((name) => {
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
      ...(includeRest ? [j.restElement(restId)] : []),
    ];

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
      styleMerger,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
    });

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: ASTNode[] = [];

    if (includeRest) {
      openingAttrs.push(j.jsxSpreadAttribute(restId));
    }

    openingAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));

    if (merging.classNameAttr) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }

    if (merging.styleAttr) {
      openingAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
      );
    }

    const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), openingAttrs, false);
    const jsx = isVoidTag
      ? ({
          type: "JSXElement",
          openingElement: { ...openingEl, selfClosing: true },
          closingElement: null,
          children: [],
        } as any)
      : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
          j.jsxExpressionContainer(childrenId),
        ]);

    const fnBodyStmts: ASTNode[] = [declStmt];
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
    if (tagName === "button" && wrapperNames.has(d.localName)) {
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
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);
    {
      const explicit = stringifyTsType(d.propsType);
      const shouldUseIntrinsicProps = (() => {
        if (supportsExternalStyles) {
          return true;
        }
        const used = getUsedAttrs(d.localName);
        if (used.has("*")) {
          return true;
        }
        // If any attribute is passed, prefer intrinsic props.
        return used.size > 0;
      })();
      const baseTypeText = shouldUseIntrinsicProps
        ? inferredIntrinsicPropsTypeText({
            d,
            tagName,
            allowClassNameProp,
            allowStyleProp,
          })
        : "{}";
      // For non-void tags without explicit type, wrap in PropsWithChildren
      const typeWithChildren =
        !explicit && !VOID_TAGS.has(tagName) ? withChildren(baseTypeText) : baseTypeText;
      emitNamedPropsType(d.localName, explicit ?? typeWithChildren);
      needsReactTypeImport = true;
    }
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

    // For local-only wrappers with no external `className`/`style` usage, keep the wrapper minimal.
    if (!allowClassNameProp && !allowStyleProp) {
      const usedAttrs = getUsedAttrs(d.localName);
      const includeRest =
        usedAttrs.has("*") ||
        !!(d as any).usedAsValue ||
        (!((d as any).isExported ?? false) && usedAttrs.size > 0);
      const variantProps = new Set<string>();
      if (d.variantStyleKeys) {
        for (const [when] of Object.entries(d.variantStyleKeys)) {
          const { props } = parseVariantWhenToAst(j, when);
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
          const { props } = parseVariantWhenToAst(j, extra.when);
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
            propsTypeName: propsTypeNameFor(d.localName),
            emitTypes,
            styleArgs,
            destructureProps,
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

    const patternProps: ASTNode[] = [
      patternProp("className", classNameId),
      ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
      patternProp("style", styleId),
      j.restElement(restId),
    ];
    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      styleMerger,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
    });

    const openingAttrs: ASTNode[] = [];

    // Default attrs (props defaulting)
    for (const a of d.attrsInfo?.defaultAttrs ?? []) {
      const propExpr = j.identifier(a.jsxProp);
      const fallback =
        typeof a.value === "string"
          ? j.literal(a.value)
          : typeof a.value === "number"
            ? j.literal(a.value)
            : typeof a.value === "boolean"
              ? j.booleanLiteral(a.value)
              : j.literal(a.value);
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier(a.attrName),
          j.jsxExpressionContainer(j.logicalExpression("??", propExpr, fallback as any)),
        ),
      );
    }

    // Conditional attrs
    for (const cond of d.attrsInfo?.conditionalAttrs ?? []) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier(cond.attrName),
          j.jsxExpressionContainer(
            j.conditionalExpression(
              j.identifier(cond.jsxProp),
              j.literal(cond.value),
              j.identifier("undefined"),
            ),
          ),
        ),
      );
    }

    // Inverted boolean attrs
    for (const inv of d.attrsInfo?.invertedBoolAttrs ?? []) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier(inv.attrName),
          j.jsxExpressionContainer(
            j.binaryExpression("!==", j.identifier(inv.jsxProp), j.booleanLiteral(true)),
          ),
        ),
      );
    }

    openingAttrs.push(j.jsxSpreadAttribute(restId));

    // Static attrs from .attrs()
    for (const [key, value] of Object.entries(d.attrsInfo?.staticAttrs ?? {})) {
      if (typeof value === "string") {
        openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
      } else if (typeof value === "boolean") {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(key),
            value ? null : j.jsxExpressionContainer(j.literal(false)),
          ),
        );
      } else if (typeof value === "number") {
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
        );
      }
    }

    openingAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));
    if (merging.classNameAttr) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }
    if (merging.styleAttr) {
      openingAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
      );
    }

    const openingEl = j.jsxOpeningElement(j.jsxIdentifier(tagName), openingAttrs, false);

    const jsx = isVoidTag
      ? ({
          type: "JSXElement",
          openingElement: { ...openingEl, selfClosing: true },
          closingElement: null,
          children: [],
        } as any)
      : j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier(tagName)), [
          j.jsxExpressionContainer(childrenId),
        ]);

    const bodyStmts: ASTNode[] = [declStmt];
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      withLeadingComments(
        j.functionDeclaration(
          j.identifier(d.localName),
          [propsParamId],
          j.blockStatement(bodyStmts),
        ),
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

    {
      const explicit = stringifyTsType(d.propsType);
      const extras: string[] = [];
      extras.push(`${sw.propAdjacent}?: boolean;`);
      if (sw.propAfter) {
        extras.push(`${sw.propAfter}?: boolean;`);
      }
      const extraType = `{ ${extras.join(" ")} }`;
      const allowClassNameProp = shouldAllowClassNameProp(d);
      const allowStyleProp = shouldAllowStyleProp(d);
      const baseTypeText = inferredIntrinsicPropsTypeText({
        d,
        tagName: "div",
        allowClassNameProp,
        allowStyleProp,
      });
      emitNamedPropsType(d.localName, explicit ?? joinIntersection(baseTypeText, extraType));
      needsReactTypeImport = true;
    }

    const propsParamId = j.identifier("props");
    annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const childrenId = j.identifier("children");
    const classNameId = j.identifier("className");
    const restId = j.identifier("rest");
    const adjId = j.identifier(sw.propAdjacent);
    const afterId = sw.propAfter ? j.identifier(sw.propAfter) : j.identifier("_unused");

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(
        j.objectPattern([
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

    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      styleMerger,
      styleArgs,
      classNameId,
      styleId: j.identifier("style"),
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
    });

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: ASTNode[] = [
      j.jsxSpreadAttribute(restId),
      j.jsxSpreadAttribute(merging.jsxSpreadExpr),
    ];
    if (merging.classNameAttr) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("className"),
          j.jsxExpressionContainer(merging.classNameAttr),
        ),
      );
    }
    if (merging.styleAttr) {
      openingAttrs.push(
        j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
      );
    }

    const openingEl = j.jsxOpeningElement(j.jsxIdentifier("div"), openingAttrs, false);
    const jsx = j.jsxElement(openingEl, j.jsxClosingElement(j.jsxIdentifier("div")), [
      j.jsxExpressionContainer(childrenId),
    ]);

    const bodyStmts: ASTNode[] = [declStmt];
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      j.functionDeclaration(j.identifier(d.localName), [propsParamId], j.blockStatement(bodyStmts)),
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
    // Skip specialized wrapper categories (polymorphic intrinsic wrappers with as/forwardedAs usage)
    if (wrapperNames.has(d.localName)) {
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
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);
    const usedAttrsForType = getUsedAttrs(d.localName);
    const allowAsProp =
      !VOID_TAGS.has(tagName) &&
      ((d.supportsExternalStyles ?? false) ||
        usedAttrsForType.has("as") ||
        usedAttrsForType.has("forwardedAs"));
    let inlineTypeText: string | undefined;
    {
      const explicit = stringifyTsType(d.propsType);
      const explicitPropNames = d.propsType ? getExplicitPropNames(d.propsType) : new Set<string>();
      const baseTypeText = inferredIntrinsicPropsTypeText({
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
        !!(d as any).usedAsValue ||
        usedAttrsForType.has("*") ||
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
            ? joinIntersection(extendBaseTypeText, customStyleDrivingPropsTypeText)
            : baseTypeText;
        }
        if (VOID_TAGS.has(tagName)) {
          return joinIntersection(extendBaseTypeText, explicit);
        }
        if (needsRestForType) {
          return joinIntersection(extendBaseTypeText, explicit);
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
          return joinIntersection(explicit, `{ ${extras.join("; ")} }`);
        }
        return withChildren(explicit);
      })();
      const asPropTypeText = allowAsProp ? "{ as?: React.ElementType }" : null;
      const mergedPropsWithChildren = allowAsProp ? mergeAsIntoPropsWithChildren(typeText) : null;
      const typeWithAs = mergedPropsWithChildren
        ? mergedPropsWithChildren
        : asPropTypeText
          ? joinIntersection(typeText, asPropTypeText)
          : typeText;
      const typeAliasEmitted = emitNamedPropsType(d.localName, typeWithAs);
      if (!typeAliasEmitted && explicit) {
        const propsTypeName = propsTypeNameFor(d.localName);
        const interfaceExtended = extendExistingInterface(propsTypeName, extendBaseTypeText);
        if (!interfaceExtended) {
          const typeAliasExtended = extendExistingTypeAlias(propsTypeName, extendBaseTypeText);
          if (!typeAliasExtended) {
            inlineTypeText = VOID_TAGS.has(tagName) ? explicit : withChildren(explicit);
            if (asPropTypeText) {
              inlineTypeText = joinIntersection(inlineTypeText, asPropTypeText);
            }
          }
        }
      }
      if (!typeAliasEmitted && asPropTypeText) {
        addAsPropToExistingType(propsTypeNameFor(d.localName));
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
          const { cond, props } = parseVariantWhenToAst(j, extra.when);
          for (const p of props) {
            if (p && !destructureProps.includes(p)) {
              destructureProps.push(p);
            }
          }
          styleArgs.push(j.logicalExpression("&&", cond, extra.expr as any));
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
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { cond, props } = parseVariantWhenToAst(j, when);
        for (const p of props) {
          if (p && !destructureProps.includes(p)) {
            destructureProps.push(p);
          }
        }

        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
          ),
        );
      }
    }

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      buildVariantDimensionLookups(d.variantDimensions, styleArgs, destructureProps, propDefaults);
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

    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const propExpr = p.jsxProp === "__props" ? j.identifier("props") : j.identifier(p.jsxProp);
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [propExpr],
      );
      if (p.jsxProp !== "__props" && !destructureProps.includes(p.jsxProp)) {
        destructureProps.push(p.jsxProp);
      }
      if (p.condition === "truthy") {
        const truthy = j.unaryExpression("!", j.unaryExpression("!", propExpr));
        styleArgs.push(j.logicalExpression("&&", truthy, call));
        continue;
      }
      const required =
        p.jsxProp === "__props" || isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        styleArgs.push(
          j.logicalExpression("&&", j.binaryExpression("!=", propExpr, j.nullLiteral()), call),
        );
      }
    }

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

    // Extract transient props (starting with $) from the explicit type and add to destructureProps
    // so they get stripped from the rest spread (styled-components transient props should never reach DOM)
    const explicit = d.propsType;
    if (explicit?.type === "TSTypeLiteral" && explicit.members) {
      for (const member of explicit.members as any[]) {
        if (
          member.type === "TSPropertySignature" &&
          member.key?.type === "Identifier" &&
          member.key.name.startsWith("$") &&
          !destructureProps.includes(member.key.name)
        ) {
          destructureProps.push(member.key.name);
        }
      }
    }

    const usedAttrs = getUsedAttrs(d.localName);
    const { hasAny: hasLocalUsage } = getJsxCallsites(d.localName);
    const explicitPropsNames = d.propsType ? getExplicitPropNames(d.propsType) : new Set<string>();
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
    const shouldIncludeRest =
      isUsedAsValueInFile(d.localName) ||
      hasExplicitPropsToPassThrough ||
      (hasLocalUsage && usedAttrs.has("*")) ||
      (hasLocalUsage &&
        [...usedAttrs].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs"
          ) {
            return false;
          }
          return !destructureProps.includes(n);
        }));

    if (allowAsProp || allowClassNameProp || allowStyleProp) {
      const isVoidTag = VOID_TAGS.has(tagName);
      const propsParamId = j.identifier("props");
      annotatePropsParam(propsParamId, d.localName, inlineTypeText);
      const propsId = j.identifier("props");
      const componentId = j.identifier("Component");
      const classNameId = j.identifier("className");
      const childrenId = j.identifier("children");
      const styleId = j.identifier("style");
      const restId = shouldIncludeRest ? j.identifier("rest") : null;

      const patternProps: ASTNode[] = [
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
        ...(isVoidTag ? [] : [patternProp("children", childrenId)]),
        ...(allowStyleProp ? [patternProp("style", styleId)] : []),
        // Add variant props to destructuring (with defaults when available)
        ...destructureProps.map((name) => {
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
        ...(restId ? [j.restElement(restId)] : []),
      ];
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      // Use the style merger helper
      const merging = emitStyleMerging({
        j,
        styleMerger,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      });

      // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
      const openingAttrs: ASTNode[] = [];
      if (restId) {
        openingAttrs.push(j.jsxSpreadAttribute(restId));
      }
      openingAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));
      if (merging.classNameAttr) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("className"),
            j.jsxExpressionContainer(merging.classNameAttr),
          ),
        );
      }
      if (merging.styleAttr) {
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
        );
      }

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

      const bodyStmts: ASTNode[] = [declStmt];
      if (merging.sxDecl) {
        bodyStmts.push(merging.sxDecl);
      }
      bodyStmts.push(j.returnStatement(jsx as any));

      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement(bodyStmts),
      );

      emitted.push(...withLeadingCommentsOnFirstFunction([fn], d));
      continue;
    }

    emitted.push(
      ...withLeadingCommentsOnFirstFunction(
        emitMinimalWrapper({
          j,
          localName: d.localName,
          tagName,
          propsTypeName: propsTypeNameFor(d.localName),
          ...(inlineTypeText ? { inlineTypeText } : {}),
          emitTypes,
          styleArgs,
          destructureProps,
          propDefaults,
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

  // Keep TS happy: some helpers are still present for parity with the previous structure.
  void root;
  void typeExistsInFile;

  // --- END extracted blocks ---

  return { emitted, needsReactTypeImport };
}
