/**
 * Step: rewrite JSX usage and remove unused styled declarations.
 * Core concepts: wrapper substitution and prop argument updates.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import type { ExpressionKind } from "../utilities/jscodeshift-utils.js";
import { readStaticJsxLiteral } from "./jsx-static-literal.js";

/** Returns true if `shouldForwardProp` indicates the prop should be dropped from DOM output. */
function shouldDropProp(decl: StyledDecl, propName: string): boolean {
  if (!decl.shouldForwardProp) {
    return false;
  }
  if (decl.shouldForwardProp.dropProps.includes(propName)) {
    return true;
  }
  if (decl.shouldForwardProp.dropPrefix && propName.startsWith(decl.shouldForwardProp.dropPrefix)) {
    return true;
  }
  return false;
}

/**
 * Rewrites JSX usages and removes styled declarations when wrappers are not required.
 */
export function rewriteJsxStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || !ctx.wrapperNames) {
    return CONTINUE;
  }

  for (const decl of styledDecls) {
    if (
      decl.isCssHelper &&
      (ctx.exportedComponents?.has(decl.localName) || decl.preserveCssHelperDeclaration)
    ) {
      continue;
    }
    // Skip removal for declarations with wrappers - they're already replaced in-place by emitWrappers
    if (decl.needsWrapperComponent) {
      // The styled declaration has been replaced with the wrapper function in emitWrappers
      // Continue to the next section which handles wrapper-specific logic
    } else {
      // Remove variable declarator for styled component (non-wrapper case)
      root
        .find(j.VariableDeclaration)
        .filter((p) =>
          p.node.declarations.some(
            (d) =>
              d.type === "VariableDeclarator" &&
              d.id.type === "Identifier" &&
              d.id.name === decl.localName,
          ),
        )
        .forEach((p) => {
          if (p.node.declarations.length === 1) {
            // Check if this is inside an ExportNamedDeclaration
            const parent = p.parentPath;
            if (parent && parent.node?.type === "ExportNamedDeclaration") {
              // Remove the entire export declaration
              j(parent).remove();
            } else {
              j(p).remove();
            }
            return;
          }
          p.node.declarations = p.node.declarations.filter(
            (d) =>
              !(
                d.type === "VariableDeclarator" &&
                d.id.type === "Identifier" &&
                d.id.name === decl.localName
              ),
          );
        });
    }

    // Preserve as a wrapper component for polymorphic/forwarded-as cases.
    // Wrapper emitters keep `forwardedAs` callsite attrs intact when needed.
    if (decl.needsWrapperComponent) {
      // Rename $-prefixed JSX attributes at call sites for components
      // whose transient props were stripped of the $ prefix.
      if (decl.transientPropRenames && decl.transientPropRenames.size > 0) {
        root
          .find(j.JSXElement, {
            openingElement: {
              name: { type: "JSXIdentifier", name: decl.localName },
            },
          })
          .forEach((p) => {
            for (const attr of p.node.openingElement.attributes ?? []) {
              if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") {
                continue;
              }
              const renamed = decl.transientPropRenames!.get(attr.name.name);
              if (renamed) {
                attr.name.name = renamed;
              }
            }
          });
      }
      continue;
    }

    // Replace JSX elements <Decl> with intrinsic tag and stylex.props
    root
      .find(j.JSXElement, {
        openingElement: {
          name: { type: "JSXIdentifier", name: decl.localName },
        },
      })
      .forEach((p) => {
        const opening = p.node.openingElement;
        const closing = p.node.closingElement;
        let finalTag = decl.base.kind === "intrinsic" ? decl.base.tagName : decl.base.ident;
        const inlineVariantDimensions = decl.inlinedBaseComponent?.hasInlineJsxVariants
          ? (decl.variantDimensions ?? [])
          : [];
        const inlineVariantByProp = new Map(
          inlineVariantDimensions.map((dimension) => [dimension.propName, dimension]),
        );
        const inlineVariantProps = new Set(
          inlineVariantDimensions.map((dimension) => dimension.propName),
        );
        // Prop names from staticBooleanVariants that use equality-based when-keys
        // (e.g., `align === "center"`) — these aren't found by `n in variantStyleKeys`
        // since the key includes the value, not just the prop name.
        const staticBooleanVariantProps = new Set(
          (decl.staticBooleanVariants ?? []).map((sbv) => sbv.propName),
        );
        const combinedStylePropNames = new Set(
          (decl.callSiteCombinedStyles ?? []).flatMap((c) => c.propNames),
        );

        // Pre-compute combined per-call-site style match from original attributes
        // (before shouldForwardProp filtering strips consumed props).
        const matchedCombinedStyleKey = matchCallSiteCombinedStyle(
          decl.callSiteCombinedStyles,
          opening.attributes ?? [],
        );

        // Handle `as="tag"` (styled-components polymorphism) by rewriting the element.
        // `forwardedAs` does NOT switch the outer rendered element; it maps to an `as`
        // attribute on the rendered element/component.
        const attrs = opening.attributes ?? [];
        for (const attr of attrs) {
          if (attr.type !== "JSXAttribute") {
            continue;
          }
          if (attr.name.type !== "JSXIdentifier") {
            continue;
          }
          const attrName = attr.name.name;
          if (attrName !== "as") {
            continue;
          }
          const v = attr.value;
          const raw =
            v && v.type === "Literal" && typeof v.value === "string"
              ? v.value
              : v && v.type === "StringLiteral"
                ? v.value
                : null;
          if (raw) {
            finalTag = raw;
          }
        }

        // Handle both simple identifiers (div) and member expressions (animated.div)
        const createJsxName = (tag: string) => {
          if (tag.includes(".")) {
            const parts = tag.split(".");
            const firstPart = parts[0];
            if (!firstPart) {
              return j.jsxIdentifier(tag);
            }
            return j.jsxMemberExpression(
              j.jsxIdentifier(firstPart),
              j.jsxIdentifier(parts.slice(1).join(".")),
            );
          }
          return j.jsxIdentifier(tag);
        };
        opening.name = createJsxName(finalTag);
        if (closing) {
          closing.name = createJsxName(finalTag);
        }

        const keptAttrs = (opening.attributes ?? []).filter((attr) => {
          if (attr.type !== "JSXAttribute") {
            return true;
          }
          if (attr.name.type !== "JSXIdentifier") {
            return true;
          }
          // Honor shouldForwardProp by dropping filtered props from DOM output.
          if (decl.shouldForwardProp) {
            const n = attr.name.name;
            if (decl.shouldForwardProp.dropProps.includes(n)) {
              if (inlineVariantProps.has(n)) {
                return true;
              }
              if (decl.variantStyleKeys && n in decl.variantStyleKeys) {
                return true;
              }
              if (staticBooleanVariantProps.has(n)) {
                return true;
              }
              return false;
            }
            if (
              decl.shouldForwardProp.dropPrefix &&
              n.startsWith(decl.shouldForwardProp.dropPrefix)
            ) {
              return false;
            }
          }
          if (attr.name.name === "as") {
            return false;
          }
          if (attr.name.name === "forwardedAs") {
            // Preserve styled-components forwardedAs semantics by lowering it to `as`
            // on the rendered element/component.
            attr.name.name = "as";
            return true;
          }
          return true;
        });

        // Apply `attrs(...)` derived attributes (static + simple prop-conditional).
        if (decl.attrsInfo) {
          const { staticAttrs, conditionalAttrs, invertedBoolAttrs } = decl.attrsInfo;

          const hasAttr = (name: string) =>
            keptAttrs.some(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === name,
            );

          // Remove transient props referenced by conditional attrs (e.g. `$small`) and
          // add the derived attribute when present.
          for (const cond of conditionalAttrs) {
            const idx = keptAttrs.findIndex(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === cond.jsxProp,
            );
            if (idx !== -1) {
              keptAttrs.splice(idx, 1);
              if (!hasAttr(cond.attrName)) {
                const literalValue =
                  typeof cond.value === "string" ||
                  typeof cond.value === "number" ||
                  typeof cond.value === "boolean"
                    ? cond.value
                    : String(cond.value);
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(cond.attrName),
                    j.jsxExpressionContainer(
                      typeof literalValue === "boolean"
                        ? j.booleanLiteral(literalValue)
                        : j.literal(literalValue),
                    ),
                  ),
                );
              }
            }
          }

          // Handle inverted boolean attrs (e.g. `"data-attr": props.X !== true`).
          // If the prop is not passed, the attr defaults to true.
          // If the prop is passed as true, the attr becomes false.
          for (const inv of invertedBoolAttrs ?? []) {
            const idx = keptAttrs.findIndex(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === inv.jsxProp,
            );
            // Remove the source prop from attrs if present
            if (idx !== -1) {
              const propAttr = keptAttrs[idx] as any;
              keptAttrs.splice(idx, 1);
              // Check if prop was passed as true
              const propVal = propAttr.value;
              const isTrue =
                propVal === null || // <Component propName /> is truthy
                (propVal?.type === "JSXExpressionContainer" &&
                  propVal.expression?.type === "BooleanLiteral" &&
                  propVal.expression.value === true);
              // props.X !== true → false when X is true
              if (!hasAttr(inv.attrName)) {
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(inv.attrName),
                    j.jsxExpressionContainer(j.literal(!isTrue)),
                  ),
                );
              }
            } else {
              // Prop not passed → undefined !== true → true
              if (!hasAttr(inv.attrName)) {
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(inv.attrName),
                    j.jsxExpressionContainer(j.literal(true)),
                  ),
                );
              }
            }
          }

          // Add static attrs (e.g. `type="text"`) if missing.
          for (const [k, v] of Object.entries(staticAttrs)) {
            if (hasAttr(k)) {
              continue;
            }
            const valNode =
              typeof v === "string"
                ? j.literal(v)
                : typeof v === "number" || typeof v === "boolean"
                  ? j.jsxExpressionContainer(j.literal(v))
                  : v === undefined
                    ? j.jsxExpressionContainer(j.identifier("undefined"))
                    : v === null
                      ? j.jsxExpressionContainer(j.literal(null))
                      : j.literal(String(v as string | number | boolean));
            keptAttrs.unshift(j.jsxAttribute(j.jsxIdentifier(k), valNode as any));
          }
        }

        // Preserve original prop order to maintain override semantics:
        // - Attrs before any spread → leading (before rest)
        // - Everything from first spread onwards → rest (in original interleaved order)
        // - stylex.props() inserted after the last spread in rest
        // - `style` attr → always last (for inline overrides)
        // - For direct JSX resolution: `className` is also extracted for merging
        const leading: typeof keptAttrs = [];
        const rest: typeof keptAttrs = [];
        let styleAttr: (typeof keptAttrs)[0] | null = null;
        let classNameAttr: (typeof keptAttrs)[0] | null = null;
        let seenSpread = false;
        for (const attr of keptAttrs) {
          if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "style"
          ) {
            styleAttr = attr;
          } else if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "className"
          ) {
            classNameAttr = attr;
          } else if (attr.type === "JSXSpreadAttribute") {
            rest.push(attr);
            seenSpread = true;
          } else if (seenSpread) {
            rest.push(attr);
          } else {
            leading.push(attr);
          }
        }

        // Insert {...stylex.props(styles.key)} after structural attrs like href/type/size (matches fixtures).
        // Build extra style args in the correct order (preserving template mixin order).
        const extraStyleKeys = decl.extraStyleKeys ?? [];
        const extraStylexPropsArgs = (decl.extraStylexPropsArgs ?? []).filter((arg) => !arg.when);
        const mixinOrder = decl.mixinOrder;
        const afterBaseKeys = new Set(decl.extraStyleKeysAfterBase ?? []);

        // Build interleaved extra args based on mixinOrder (if available)
        const extraMixinArgs: ExpressionKind[] = [];
        const extraAfterBaseArgs: ExpressionKind[] = [];
        if (mixinOrder && mixinOrder.length > 0) {
          let styleKeyIdx = 0;
          let propsArgIdx = 0;
          for (const entry of mixinOrder) {
            if (entry === "styleKey" && styleKeyIdx < extraStyleKeys.length) {
              const key = extraStyleKeys[styleKeyIdx];
              styleKeyIdx++;
              if (key) {
                const expr = j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(key),
                );
                if (afterBaseKeys.has(key)) {
                  extraAfterBaseArgs.push(expr);
                } else {
                  extraMixinArgs.push(expr);
                }
              }
            } else if (entry === "propsArg" && propsArgIdx < extraStylexPropsArgs.length) {
              const arg = extraStylexPropsArgs[propsArgIdx];
              propsArgIdx++;
              if (arg) {
                if (arg.afterBase) {
                  extraAfterBaseArgs.push(arg.expr);
                } else {
                  extraMixinArgs.push(arg.expr);
                }
              }
            }
          }
        } else {
          // Fallback: no order tracking, use legacy behavior (propsArgs first, then styleKeys)
          for (const arg of extraStylexPropsArgs) {
            extraMixinArgs.push(arg.expr);
          }
          for (const key of extraStyleKeys) {
            const expr = j.memberExpression(
              j.identifier(ctx.stylesIdentifier ?? "styles"),
              j.identifier(key),
            );
            if (afterBaseKeys.has(key)) {
              extraAfterBaseArgs.push(expr);
            } else {
              extraMixinArgs.push(expr);
            }
          }
        }

        // When a combined per-call-site style matches, use it INSTEAD of the base
        // style — the combined entry already includes all base + consumed-prop styles.
        const baseStyleKey = matchedCombinedStyleKey ?? decl.styleKey;

        const styleArgs: ExpressionKind[] = [
          ...(decl.extendsStyleKey
            ? [
                j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(decl.extendsStyleKey),
                ),
              ]
            : []),
          ...extraMixinArgs,
          j.memberExpression(
            j.identifier(ctx.stylesIdentifier ?? "styles"),
            j.identifier(baseStyleKey),
          ),
          ...extraAfterBaseArgs,
        ];

        const variantKeys = decl.variantStyleKeys ?? {};
        const variantProps = new Set(Object.keys(variantKeys));

        // Build a map from prop name → equality-based variant entries.
        // variantStyleKeys may contain keys like `align === "center"` from
        // staticBooleanVariants; these need special handling because the JSX
        // attribute name is just `align`, not the full when-key.
        const equalityVariantsByProp = new Map<
          string,
          Array<{ value: string; styleKey: string }>
        >();
        for (const [whenKey, styleKey] of Object.entries(variantKeys)) {
          const eqMatch = whenKey.match(/^(\w+)\s*===\s*"([^"]+)"$/);
          if (eqMatch) {
            const propName = eqMatch[1]!;
            const value = eqMatch[2]!;
            let arr = equalityVariantsByProp.get(propName);
            if (!arr) {
              arr = [];
              equalityVariantsByProp.set(propName, arr);
            }
            arr.push({ value, styleKey });
          }
        }
        const keptLeadingAfterVariants: typeof leading = [];
        const keptRestAfterVariants: typeof rest = [];
        const styleFnPairs = decl.styleFnFromProps ?? [];
        const styleFnProps = new Set(styleFnPairs.map((p) => p.jsxProp));

        // Rename $-prefixed JSX attributes for inlined components whose transient
        // props were stripped of the $ prefix — ensures styleFn/variant lookups match.
        const renamedTransientValues = decl.transientPropRenames
          ? new Set(decl.transientPropRenames.values())
          : undefined;
        if (decl.transientPropRenames && decl.transientPropRenames.size > 0) {
          for (const attrNode of [...leading, ...rest]) {
            if (attrNode.type === "JSXAttribute" && attrNode.name.type === "JSXIdentifier") {
              const renamed = decl.transientPropRenames.get(attrNode.name.name);
              if (renamed) {
                attrNode.name.name = renamed;
              }
            }
          }
        }

        // Helper to process attrs (strip variants, transient props, styleFn props)
        // Returns true if attr should be kept, false if consumed/stripped
        const processAttr = (attr: (typeof leading)[0], output: typeof leading): void => {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") {
            output.push(attr);
            return;
          }
          const n = attr.name.name;
          const hasTemplateVariant = variantProps.has(n);

          // Convert certain interpolated props into dynamic StyleX styles (e.g. padding from `$padding`).
          if (styleFnProps.has(n)) {
            const pairs = styleFnPairs.filter((p) => p.jsxProp === n);
            const valueExpr = !attr.value
              ? j.literal(true)
              : attr.value.type === "StringLiteral"
                ? j.literal(attr.value.value)
                : attr.value.type === "Literal"
                  ? j.literal((attr.value as any).value)
                  : attr.value.type === "JSXExpressionContainer"
                    ? (attr.value.expression as any)
                    : null;
            if (valueExpr) {
              for (const p of pairs) {
                styleArgs.push(
                  j.callExpression(
                    j.memberExpression(
                      j.identifier(ctx.stylesIdentifier ?? "styles"),
                      j.identifier(p.fnKey),
                    ),
                    [valueExpr],
                  ),
                );
              }
            }
            return;
          }

          // Props handled by combined per-call-site styles are already applied above;
          // just strip the attribute without adding individual style args.
          if (combinedStylePropNames.has(n) && matchedCombinedStyleKey) {
            return;
          }

          const inlineVariantDimension = inlineVariantByProp.get(n);
          if (inlineVariantDimension) {
            const variantLookup = buildInlineVariantLookupFromAttr(
              j,
              inlineVariantDimension.variantObjectName,
              attr,
            );
            if (variantLookup) {
              styleArgs.push(variantLookup);
              if (!hasTemplateVariant) {
                return;
              }
            } else if (!hasTemplateVariant) {
              if (!shouldDropProp(decl, n)) {
                output.push(attr);
              }
              return;
            }
          }

          // Handle equality-based variants from staticBooleanVariants (e.g., `align === "center"`).
          // Match JSX attr value against known variant values and add the corresponding style.
          const eqVariants = equalityVariantsByProp.get(n);
          if (eqVariants) {
            const attrValue = readStaticJsxLiteral(attr);
            if (attrValue !== undefined) {
              const strValue = String(attrValue);
              const matched = eqVariants.find((ev) => ev.value === strValue);
              if (matched) {
                styleArgs.push(
                  j.memberExpression(
                    j.identifier(ctx.stylesIdentifier ?? "styles"),
                    j.identifier(matched.styleKey),
                  ),
                );
                return;
              }
            }
            // No match — drop if shouldForwardProp says to, otherwise keep
            if (!hasTemplateVariant) {
              if (!shouldDropProp(decl, n)) {
                output.push(attr);
              }
              return;
            }
          }

          if (!hasTemplateVariant) {
            // Strip transient props only for intrinsic elements:
            // - Props starting with $ (original transient props)
            // - Props that were renamed from $-prefixed names (via transientPropRenames)
            // For styled(Component), transient props should still reach the wrapped component
            // (unless consumed by styleFnFromProps, which is handled above).
            if (
              (n.startsWith("$") || renamedTransientValues?.has(n)) &&
              decl.base.kind === "intrinsic"
            ) {
              return;
            }
            output.push(attr);
            return;
          }

          const variantStyleKey = variantKeys[n]!;
          if (!attr.value) {
            // <X $prop>
            styleArgs.push(
              j.memberExpression(
                j.identifier(ctx.stylesIdentifier ?? "styles"),
                j.identifier(variantStyleKey),
              ),
            );
            return;
          }
          if (attr.value.type === "JSXExpressionContainer") {
            // If the expression is a known truthy static literal (e.g. gap={24}),
            // apply the style unconditionally to avoid `24 && styles.x` (always truthy).
            const staticLiteralValue = readStaticJsxLiteral(attr);
            if (staticLiteralValue !== undefined && staticLiteralValue) {
              styleArgs.push(
                j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(variantStyleKey),
                ),
              );
              return;
            }
            // <X $prop={expr}>
            styleArgs.push(
              j.logicalExpression(
                "&&",
                attr.value.expression as any,
                j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(variantStyleKey),
                ),
              ),
            );
            return;
          }
          if (
            attr.value.type === "StringLiteral" ||
            attr.value.type === "NumericLiteral" ||
            attr.value.type === "Literal"
          ) {
            // <X prop="value"> — only apply for truthy values; falsy literals like
            // "" should not trigger truthy-guard variants (matches && semantics).
            const literalVal = readStaticJsxLiteral(attr);
            if (literalVal !== undefined && literalVal) {
              styleArgs.push(
                j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(variantStyleKey),
                ),
              );
            }
            return;
          }
          // Any other value shape: drop the prop without attempting to apply a variant.
        };

        // Process leading attrs (before any spread)
        for (const attr of leading) {
          processAttr(attr, keptLeadingAfterVariants);
        }

        // Process rest attrs (from first spread onwards, preserving interleaved order)
        for (const attr of rest) {
          processAttr(attr, keptRestAfterVariants);
        }

        // Recalculate insert index after filtering (some attrs may have been removed)
        let finalInsertIndex = keptRestAfterVariants.length;
        for (let i = keptRestAfterVariants.length - 1; i >= 0; i--) {
          const attr = keptRestAfterVariants[i];
          if (attr && attr.type === "JSXSpreadAttribute") {
            finalInsertIndex = i + 1;
            break;
          }
        }

        // Handle promoted style props: consume the style attr by adding promoted
        // entries to styleArgs instead of using mergedSx.
        const promotedKey = (opening as any).__promotedStyleKey as string | undefined;
        const promotedArgs = (opening as any).__promotedStyleArgs as ExpressionKind[] | undefined;
        const promotedMerge = (opening as any).__promotedMergeIntoBase as boolean | undefined;

        if (promotedKey) {
          const stylesId = ctx.stylesIdentifier ?? "styles";
          if (promotedArgs?.length) {
            // Dynamic function call: styles.fnKey(arg1, arg2, ...)
            styleArgs.push(
              j.callExpression(
                j.memberExpression(j.identifier(stylesId), j.identifier(promotedKey)),
                promotedArgs as ExpressionKind[],
              ),
            );
          } else {
            // Static style: styles.staticKey
            styleArgs.push(j.memberExpression(j.identifier(stylesId), j.identifier(promotedKey)));
          }
          // Consume the style attr so it's not passed through or merged.
          styleAttr = null;
        }

        // For mergeIntoBase: styles already merged into the base style key,
        // just consume the style attr.
        if (promotedMerge) {
          styleAttr = null;
        }

        // Build final rest with stylex.props inserted after last spread.
        // For inlined components with className/style, use adapter-configured
        // merger behavior (or verbose fallback when no merger is configured).
        const needsMerge = classNameAttr !== null || styleAttr !== null;
        const isIntrinsicTag = /^[a-z]/.test(finalTag) && !finalTag.includes(".");
        const useSxProp = ctx.adapter.useSxProp && !needsMerge && isIntrinsicTag;
        const stylexAttr = useSxProp
          ? (() => {
              const sxExpr =
                styleArgs.length === 1 && styleArgs[0]
                  ? styleArgs[0]
                  : j.arrayExpression([...styleArgs]);
              return j.jsxAttribute(j.jsxIdentifier("sx"), j.jsxExpressionContainer(sxExpr));
            })()
          : j.jsxSpreadAttribute(
              needsMerge
                ? buildInlineMergeCall(
                    j,
                    styleArgs,
                    classNameAttr,
                    styleAttr,
                    ctx.adapter.styleMerger?.functionName,
                  )
                : j.callExpression(
                    j.memberExpression(j.identifier("stylex"), j.identifier("props")),
                    [...styleArgs],
                  ),
            );
        const finalRest = [
          ...keptRestAfterVariants.slice(0, finalInsertIndex),
          stylexAttr,
          ...keptRestAfterVariants.slice(finalInsertIndex),
        ];

        // Final order: leading attrs, rest (with stylex.props/merge call inserted).
        // When merge call is used, className/style are already folded into the call.
        opening.attributes = [
          ...keptLeadingAfterVariants,
          ...finalRest,
          ...(styleAttr && !needsMerge ? [styleAttr] : []),
        ];
      });
  }

  return CONTINUE;
}

function buildInlineVariantLookupFromAttr(
  j: TransformContext["j"]["jscodeshift"],
  variantObjectName: string,
  attr: unknown,
): ExpressionKind | undefined {
  const value = readStaticJsxLiteral(attr);
  if (value === undefined) {
    return undefined;
  }
  // Boolean `true` (from bare JSX attributes like `<Foo column>`) must use dot access
  // (`variants.true`) since literal `true` can't be a computed property index in TypeScript.
  if (value === true) {
    return j.memberExpression(j.identifier(variantObjectName), j.identifier("true"));
  }
  return j.memberExpression(j.identifier(variantObjectName), j.literal(value), true /* computed */);
}

/**
 * Builds an inline style/class merge call for inlined components that receive
 * className and/or style at a call site.
 *
 * - With configured styleMerger: calls adapter merger (e.g. `stylexProps(...)`).
 * - Without styleMerger: emits a verbose inline fallback around `stylex.props(...)`.
 */
function buildInlineMergeCall(
  j: TransformContext["j"]["jscodeshift"],
  styleArgs: ExpressionKind[],
  classNameAttr: unknown,
  styleAttr: unknown,
  styleMergerFunctionName: string | undefined,
): ExpressionKind {
  const stylesArg = styleArgs.length === 1 ? styleArgs[0]! : j.arrayExpression([...styleArgs]);

  const classNameExpr = extractJsxAttrValueExpr(j, classNameAttr);
  const styleExpr = extractJsxAttrValueExpr(j, styleAttr);

  if (styleMergerFunctionName) {
    return j.callExpression(j.identifier(styleMergerFunctionName), [
      stylesArg,
      ...(classNameExpr ? [classNameExpr] : styleExpr ? [j.identifier("undefined")] : []),
      ...(styleExpr ? [styleExpr] : []),
    ]);
  }

  return buildInlineVerboseMergeFallback(j, stylesArg, classNameExpr, styleExpr);
}

function buildInlineVerboseMergeFallback(
  j: TransformContext["j"]["jscodeshift"],
  stylesArg: ExpressionKind,
  classNameExpr: ExpressionKind | undefined,
  styleExpr: ExpressionKind | undefined,
): ExpressionKind {
  const sxIdentifier = j.identifier("sx");
  const sxClassName = j.memberExpression(sxIdentifier, j.identifier("className"));
  const sxStyle = j.memberExpression(sxIdentifier, j.identifier("style"));

  const classNameValue = classNameExpr
    ? j.callExpression(
        j.memberExpression(
          j.callExpression(
            j.memberExpression(
              j.arrayExpression([sxClassName, classNameExpr]),
              j.identifier("filter"),
            ),
            [j.identifier("Boolean")],
          ),
          j.identifier("join"),
        ),
        [j.literal(" ")],
      )
    : sxClassName;

  const styleValue = styleExpr
    ? j.conditionalExpression(
        sxStyle,
        j.objectExpression([j.spreadElement(sxStyle), j.spreadElement(styleExpr)]),
        styleExpr,
      )
    : sxStyle;

  return j.callExpression(
    j.arrowFunctionExpression(
      [],
      j.blockStatement([
        j.variableDeclaration("const", [
          j.variableDeclarator(
            sxIdentifier,
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
              stylesArg,
            ]),
          ),
        ]),
        j.returnStatement(
          j.objectExpression([
            j.property("init", j.identifier("className"), classNameValue),
            j.property("init", j.identifier("style"), styleValue),
          ]),
        ),
      ]),
    ),
    [],
  );
}

/** Extracts the value expression from a JSX attribute node. */
function extractJsxAttrValueExpr(
  j: TransformContext["j"]["jscodeshift"],
  attr: unknown,
): ExpressionKind | undefined {
  if (!attr) {
    return undefined;
  }
  const a = attr as {
    value?: { type?: string; value?: unknown; expression?: unknown };
  };
  if (!a.value) {
    return j.literal(true) as unknown as ExpressionKind;
  }
  if (a.value.type === "StringLiteral" || a.value.type === "Literal") {
    return j.literal(a.value.value as string | number | boolean) as unknown as ExpressionKind;
  }
  if (a.value.type === "JSXExpressionContainer") {
    return a.value.expression as ExpressionKind;
  }
  return undefined;
}

/**
 * Finds the combined style key matching the consumed props at a JSX call site.
 * Returns the style key if a matching combination exists, or undefined otherwise.
 */
function matchCallSiteCombinedStyle(
  combinedStyles: StyledDecl["callSiteCombinedStyles"],
  attrs: ReadonlyArray<unknown>,
): string | undefined {
  if (!combinedStyles?.length) {
    return undefined;
  }
  const attrNames = new Set<string>();
  for (const a of attrs) {
    const attr = a as {
      type?: string;
      name?: { type?: string; name?: string };
    };
    if (
      attr.type === "JSXAttribute" &&
      attr.name?.type === "JSXIdentifier" &&
      typeof attr.name.name === "string"
    ) {
      attrNames.add(attr.name.name);
    }
  }
  const allCombinedPropNames = new Set(combinedStyles.flatMap((c) => c.propNames));
  const presentPropNames = [...allCombinedPropNames].filter((p) => attrNames.has(p)).sort();
  if (presentPropNames.length === 0) {
    return undefined;
  }
  const key = presentPropNames.join(",");
  const match = combinedStyles.find((c) => [...c.propNames].sort().join(",") === key);
  return match?.styleKey;
}
