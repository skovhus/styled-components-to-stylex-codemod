/**
 * Step: rewrite JSX usage and remove unused styled declarations.
 * Core concepts: wrapper substitution and prop argument updates.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { cloneAstNode, type ExpressionKind } from "../utilities/jscodeshift-utils.js";
import { buildStaticAttrFromValue } from "../emit-wrappers/jsx-builders.js";
import { wrapCallArgForPropsObject } from "../emit-wrappers/style-expr-builders.js";
import { mergeAdjacentComplementaryStyleExprs } from "../emit-wrappers/variant-condition.js";
import { readStaticJsxLiteral } from "../utilities/jsx-static-literal.js";
import { resolveExistingFilePath } from "../utilities/path-utils.js";
import { transformedComponentAcceptsSx } from "../utilities/sx-surface.js";
import { findTypeScriptComponentMetadata } from "../utilities/typescript-metadata.js";
import { wrappedComponentInterfaceFor } from "../utilities/wrapped-component-interface.js";
import {
  buildExtraClassNameExpr,
  buildInlineMergeCall,
  extractJsxAttrValueExpr,
  literalExprForDynamicAttrDefault,
  mergeClassNameAttrs,
  removeJsxAttrsByName,
} from "./rewrite-jsx-attrs.js";
import {
  hasPreviousStaticSiblingWithName,
  preserveInlineJsxTextWhitespace,
} from "./rewrite-jsx-whitespace.js";
import { jsxNameReferencesStyledLocal } from "./rewrite-jsx-name-resolution.js";
import { emitStaticInlineStyleConstants } from "./rewrite-jsx-inline-style-constants.js";

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

function substituteStyleFnCallArg(
  callArg: ExpressionKind | undefined,
  propNames: string[],
  valueExpr: ExpressionKind,
): ExpressionKind {
  if (!callArg) {
    return valueExpr;
  }
  const names = new Set(propNames);
  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(visit);
    }
    const record = node as Record<string, unknown>;
    if (record.type === "Identifier" && typeof record.name === "string" && names.has(record.name)) {
      return cloneAstNode(valueExpr);
    }
    for (const key of Object.keys(record)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = record[key];
      if (child && typeof child === "object") {
        record[key] = visit(child);
      }
    }
    return node;
  };
  return visit(cloneAstNode(callArg)) as ExpressionKind;
}

function wrappedComponentAcceptsSxProp(
  ctx: TransformContext,
  componentLocalName: string,
  visiting = new Set<string>(),
): boolean {
  if (!ctx.adapter.useSxProp) {
    return false;
  }
  if (visiting.has(componentLocalName)) {
    return false;
  }
  visiting.add(componentLocalName);

  const localStyledDecl = ctx.styledDecls?.find((decl) => decl.localName === componentLocalName);
  if (
    localStyledDecl?.needsWrapperComponent &&
    localStyledDecl.base.kind === "component" &&
    wrappedComponentAcceptsSxProp(ctx, localStyledDecl.base.ident, visiting)
  ) {
    visiting.delete(componentLocalName);
    return true;
  }
  // A local styled decl emitted as a wrapper that supports external styles takes
  // an `sx` prop (merged after its own styles via the style merger), so callers
  // can delegate extension styles through it.
  if (
    localStyledDecl?.needsWrapperComponent &&
    !localStyledDecl.skipTransform &&
    localStyledDecl.supportsExternalStyles
  ) {
    visiting.delete(componentLocalName);
    return true;
  }

  const componentInterface = wrappedComponentInterfaceFor(ctx, componentLocalName);
  if (componentInterface !== undefined) {
    visiting.delete(componentLocalName);
    return componentInterface.acceptsSx === true && componentInterface.sxTarget !== "inner";
  }

  const [rootLocalName] = componentLocalName.split(".");
  const importInfo = rootLocalName ? ctx.importMap?.get(rootLocalName) : undefined;
  const typedComponent = (() => {
    if (importInfo?.source.kind === "absolutePath") {
      const names =
        importInfo.importedName === "default"
          ? [componentLocalName, importInfo.importedName]
          : [importInfo.importedName];
      return findTypeScriptComponentMetadata(
        ctx.options.crossFileInfo?.typeScriptMetadata,
        importInfo.source.value,
        names,
      );
    }
    return findTypeScriptComponentMetadata(
      ctx.options.crossFileInfo?.typeScriptMetadata,
      ctx.file.path,
      [componentLocalName],
    );
  })();
  if (typedComponent) {
    if (typedComponent.supportsSxProp && typedComponent.sxTarget !== "inner") {
      visiting.delete(componentLocalName);
      return true;
    }
    if (
      importInfo?.source.kind !== "absolutePath" ||
      ctx.options.transformedFileSources?.has(resolveExistingFilePath(importInfo.source.value)) !==
        true
    ) {
      visiting.delete(componentLocalName);
      return false;
    }
  }

  const accepts =
    rootLocalName === componentLocalName &&
    importInfo?.source.kind === "absolutePath" &&
    transformedComponentAcceptsSx({
      absolutePath: importInfo.source.value,
      componentNames:
        importInfo.importedName === "default"
          ? [componentLocalName, importInfo.importedName]
          : [importInfo.importedName],
      sourceOverrides: ctx.options.transformedFileSources,
    });
  visiting.delete(componentLocalName);
  return accepts;
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

  emitStaticInlineStyleConstants(ctx, styledDecls);

  for (const decl of styledDecls) {
    if (decl.skipTransform) {
      continue;
    }
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
          .find(j.JSXElement)
          .filter((p: any) =>
            jsxNameReferencesStyledLocal(p.node.openingElement.name, decl.localName, root, j, p),
          )
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
      if (!decl.promotedStyleProps?.length) {
        continue;
      }
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

        // For wrapper components, only inline call sites with non-merge promoted styles;
        // plain call sites keep using the wrapper function.
        if (decl.needsWrapperComponent) {
          const hasPromoted =
            ((opening as any).__promotedStyleKey && !(opening as any).__promotedMergeIntoBase) ||
            (opening as any).__promotedMergeArgs ||
            (opening as any).__promotedConditionalVariant;
          if (!hasPromoted) {
            return;
          }
        }

        const closing = p.node.closingElement;
        (opening as { __styledComponentLocalName?: string }).__styledComponentLocalName =
          decl.localName;
        let finalTag =
          decl.attrsInfo?.attrsAsTag ??
          (decl.base.kind === "intrinsic" ? decl.base.tagName : decl.base.ident);
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
            const [firstPart, ...memberParts] = parts;
            if (!firstPart || memberParts.length === 0) {
              return j.jsxIdentifier(tag);
            }
            type JsxMemberObject = Parameters<typeof j.jsxMemberExpression>[0];
            return memberParts.reduce<JsxMemberObject>(
              (object, member) => j.jsxMemberExpression(object, j.jsxIdentifier(member)),
              j.jsxIdentifier(firstPart),
            );
          }
          return j.jsxIdentifier(tag);
        };
        opening.name = createJsxName(finalTag);
        if (closing) {
          closing.name = createJsxName(finalTag);
        }

        const styleFnPairs = decl.styleFnFromProps ?? [];
        const styleFnProps = new Set(styleFnPairs.map((p) => p.jsxProp));
        const isIntrinsicTag = /^[a-z]/.test(finalTag) && !finalTag.includes(".");
        const staticInlineStyleExpr =
          decl.staticInlineStyleConstName && isIntrinsicTag
            ? (j.identifier(decl.staticInlineStyleConstName) as ExpressionKind)
            : null;

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
              // Keep props consumed by styleFnFromProps — processAttr will
              // consume the value and emit a style function call, stripping
              // the attribute in the process.
              if (styleFnProps.has(n)) {
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
          const {
            staticAttrs,
            dynamicAttrs,
            conditionalAttrs,
            invertedBoolAttrs,
            attrsStaticStyleExpr,
          } = decl.attrsInfo;

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

          for (const dyn of dynamicAttrs ?? []) {
            const idx = keptAttrs.findIndex(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name.type === "JSXIdentifier" &&
                a.name.name === dyn.jsxProp,
            );
            if (idx !== -1) {
              const propAttr = keptAttrs[idx] as (typeof keptAttrs)[number];
              const valueExpr = extractJsxAttrValueExpr(j, propAttr);
              if (valueExpr) {
                removeJsxAttrsByName(keptAttrs, dyn.attrName);
                keptAttrs.unshift(
                  j.jsxAttribute(
                    j.jsxIdentifier(dyn.attrName),
                    j.jsxExpressionContainer(
                      dyn.defaultValue === undefined
                        ? valueExpr
                        : j.conditionalExpression(
                            j.binaryExpression("===", valueExpr, j.identifier("undefined")),
                            literalExprForDynamicAttrDefault(j, dyn.defaultValue),
                            valueExpr,
                          ),
                    ),
                  ),
                );
              }
            } else if (dyn.defaultValue !== undefined) {
              removeJsxAttrsByName(keptAttrs, dyn.attrName);
              keptAttrs.unshift(
                j.jsxAttribute(
                  j.jsxIdentifier(dyn.attrName),
                  j.jsxExpressionContainer(literalExprForDynamicAttrDefault(j, dyn.defaultValue)),
                ),
              );
            }
          }

          // Add static attrs (e.g. `type="text"`) if missing.
          for (const [k, v] of Object.entries(staticAttrs)) {
            if (k === "className") {
              continue;
            }
            if (hasAttr(k)) {
              continue;
            }
            const attr = buildStaticAttrFromValue(j, k, v, { booleanTrueAsShorthand: false });
            if (attr) {
              keptAttrs.unshift(attr);
            }
          }
          if (staticAttrs.className !== undefined) {
            const attr = buildStaticAttrFromValue(j, "className", staticAttrs.className, {
              booleanTrueAsShorthand: false,
            });
            if (attr) {
              keptAttrs.unshift(attr);
            }
          }
          if (attrsStaticStyleExpr) {
            keptAttrs.unshift(
              j.jsxAttribute(
                j.jsxIdentifier("style"),
                j.jsxExpressionContainer(cloneAstNode(attrsStaticStyleExpr)),
              ),
            );
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
        let hasCallerStyleAttr = false;
        let classNameAttr: (typeof keptAttrs)[0] | null = null;
        // `sxAttr` is captured separately so the inlined `sx={...}` replacement can
        // compose the caller-supplied `sx` into the new one (avoids duplicate `sx=`
        // attributes and silent overrides). Set later by the sx-aware-wrapped path.
        let sxAttr: (typeof keptAttrs)[0] | null = null;
        let seenSpread = false;
        for (const attr of keptAttrs) {
          if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "style"
          ) {
            hasCallerStyleAttr = true;
            const callerStyleExpr = extractJsxAttrValueExpr(j, attr);
            const existingStyleExpr = extractJsxAttrValueExpr(j, styleAttr);
            if (existingStyleExpr || staticInlineStyleExpr) {
              styleAttr = j.jsxAttribute(
                j.jsxIdentifier("style"),
                j.jsxExpressionContainer(
                  callerStyleExpr
                    ? j.objectExpression([
                        ...(staticInlineStyleExpr ? [j.spreadElement(staticInlineStyleExpr)] : []),
                        ...(existingStyleExpr ? [j.spreadElement(existingStyleExpr)] : []),
                        j.spreadElement(callerStyleExpr),
                      ])
                    : (existingStyleExpr ?? staticInlineStyleExpr!),
                ),
              );
            } else {
              styleAttr = attr;
            }
          } else if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "className"
          ) {
            classNameAttr = mergeClassNameAttrs(j, classNameAttr, attr);
          } else if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "sx"
          ) {
            sxAttr = attr;
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
        const extraAfterVariantArgs: ExpressionKind[] = [];
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
                if (arg.afterVariants) {
                  extraAfterVariantArgs.push(arg.expr);
                } else if (arg.afterBase) {
                  extraAfterBaseArgs.push(arg.expr);
                } else {
                  extraMixinArgs.push(arg.expr);
                }
              }
            }
          }
          for (; styleKeyIdx < extraStyleKeys.length; styleKeyIdx++) {
            const key = extraStyleKeys[styleKeyIdx];
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
          }
          for (; propsArgIdx < extraStylexPropsArgs.length; propsArgIdx++) {
            const arg = extraStylexPropsArgs[propsArgIdx];
            if (arg) {
              if (arg.afterVariants) {
                extraAfterVariantArgs.push(arg.expr);
              } else {
                extraAfterBaseArgs.push(arg.expr);
              }
            }
          }
        } else {
          // Fallback: no order tracking, use the wrapper emitter's legacy order.
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
          for (const arg of extraStylexPropsArgs) {
            if (arg.afterVariants) {
              extraAfterVariantArgs.push(arg.expr);
            } else {
              extraAfterBaseArgs.push(arg.expr);
            }
          }
        }

        // When a combined per-call-site style matches, use it INSTEAD of the base
        // style — the combined entry already includes all base + consumed-prop styles.
        const baseStyleKey = matchedCombinedStyleKey ?? decl.styleKey;

        // When a dynamic merge replaced the base with an arrow function, emit
        // the base as a function call: styles.foo(arg1, arg2).
        // Only use mergeArgs when NOT using a combined style key (combined keys
        // are always static objects, not functions).
        const mergeArgs = matchedCombinedStyleKey
          ? undefined
          : ((opening as any).__promotedMergeArgs as ExpressionKind[] | undefined);
        const baseMember = j.memberExpression(
          j.identifier(ctx.stylesIdentifier ?? "styles"),
          j.identifier(baseStyleKey),
        );
        const baseExpr: ExpressionKind = mergeArgs
          ? j.callExpression(baseMember, mergeArgs)
          : baseMember;

        // When skipBaseStyleRef is set, the base style key IS a dynamic function
        // (static properties were merged into it). Don't include the bare reference —
        // processAttr will emit the function call when it consumes the prop.
        //
        // When the rendered element is itself a converted local wrapper component
        // (the extension chain could not be flattened, e.g. the base consumes props
        // via dynamic style functions), the wrapper already applies its own base
        // styles internally — re-applying styles.<extendsKey> here would duplicate
        // them, and for a dynamic base it would pass the style function uncalled.
        const rendersLocalWrapperBase =
          decl.base.kind === "component" &&
          decl.base.ident === finalTag &&
          (ctx.styledDecls?.some(
            (d) => d.localName === finalTag && d.needsWrapperComponent && !d.skipTransform,
          ) ??
            false);
        const styleArgs: ExpressionKind[] = [
          ...(decl.extendsStyleKey && !rendersLocalWrapperBase
            ? [
                j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(decl.extendsStyleKey),
                ),
              ]
            : []),
          ...extraMixinArgs,
          ...(decl.skipBaseStyleRef ? [] : [baseExpr]),
          ...extraAfterBaseArgs,
        ];
        const adjacentSiblingStyleKey = decl.adjacentSiblingStyleKey;

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
                const rawCallArg = substituteStyleFnCallArg(p.callArg, [n, p.jsxProp], valueExpr);
                const callArg = wrapCallArgForPropsObject(j, rawCallArg, p.propsObjectKey);
                const fnCallExpr = j.callExpression(
                  j.memberExpression(
                    j.identifier(ctx.stylesIdentifier ?? "styles"),
                    j.identifier(p.fnKey),
                  ),
                  [callArg],
                );
                // When the styleFn was merged into the base key, replace the
                // base reference with the function call to avoid duplication.
                if (p.fnKey === baseStyleKey) {
                  const baseIdx = styleArgs.indexOf(baseExpr);
                  if (baseIdx >= 0) {
                    styleArgs[baseIdx] = fnCallExpr;
                  } else {
                    styleArgs.push(fnCallExpr);
                  }
                } else {
                  styleArgs.push(fnCallExpr);
                }
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
            // The style-consuming paths above have already handled props that are
            // needed for generated variants/style functions.
            const shouldStripRenamedTransient =
              renamedTransientValues?.has(n) &&
              (decl.base.kind === "intrinsic" || styleFnProps.has(n) || variantProps.has(n));
            if (n.startsWith("$") || shouldStripRenamedTransient) {
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

        styleArgs.push(...extraAfterVariantArgs);

        if (adjacentSiblingStyleKey && hasPreviousStaticSiblingWithName(p, decl.localName)) {
          styleArgs.push(
            j.memberExpression(
              j.identifier(ctx.stylesIdentifier ?? "styles"),
              j.identifier(adjacentSiblingStyleKey),
            ),
          );
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
        const promotedConditionalVariant = (
          opening as { __promotedConditionalVariant?: { styleKey: string; conditionExpr: unknown } }
        ).__promotedConditionalVariant;

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

        // Shared-ternary promotion: emit `cond && styles.variantKey` after the
        // base style, so the truthy branch overrides the alternate values
        // already folded into the base.
        if (promotedConditionalVariant) {
          const stylesId = ctx.stylesIdentifier ?? "styles";
          styleArgs.push(
            j.logicalExpression(
              "&&",
              promotedConditionalVariant.conditionExpr as ExpressionKind,
              j.memberExpression(
                j.identifier(stylesId),
                j.identifier(promotedConditionalVariant.styleKey),
              ),
            ),
          );
        }

        // Build extra className expression from CSS module classes (if any).
        const extraClassNameExpr =
          decl.extraClassNames && decl.extraClassNames.length > 0
            ? buildExtraClassNameExpr(j, decl.extraClassNames)
            : undefined;

        // Build final rest with stylex.props inserted after last spread.
        // For inlined components with className/style, use adapter-configured
        // merger behavior (or verbose fallback when no merger is configured).
        if (!styleAttr && decl.attrsInfo?.attrsStaticStyleExpr) {
          styleAttr = j.jsxAttribute(
            j.jsxIdentifier("style"),
            j.jsxExpressionContainer(cloneAstNode(decl.attrsInfo.attrsStaticStyleExpr)),
          );
        }

        if (staticInlineStyleExpr && !styleAttr) {
          styleAttr = j.jsxAttribute(
            j.jsxIdentifier("style"),
            j.jsxExpressionContainer(staticInlineStyleExpr),
          );
        }

        // The adapter may declare that an imported component accepts a StyleX `sx`
        // prop (already migrated to StyleX). When wrapping such a component, emit
        // `sx={...}` on the wrapped tag instead of `{...stylex.props(...)}`.
        const wrappedAcceptsSxProp =
          !isIntrinsicTag && wrappedComponentAcceptsSxProp(ctx, finalTag);

        // When NOT using sx prop, CSS module classNames must be merged into
        // the stylex.props spread (via classNameAttr) to avoid a duplicate
        // className attribute that would override the spread's className.
        // When using sx prop, sx and className are independent attributes.
        let effectiveClassNameAttr = classNameAttr;
        if (extraClassNameExpr && !ctx.adapter.useSxProp) {
          // Synthesize a JSX className attribute so buildInlineMergeCall
          // folds the CSS module class into the spread merge.
          const extraClassNameAttr = j.jsxAttribute(
            j.jsxIdentifier("className"),
            j.jsxExpressionContainer(extraClassNameExpr),
          );
          effectiveClassNameAttr = effectiveClassNameAttr
            ? mergeClassNameAttrs(j, effectiveClassNameAttr, extraClassNameAttr)
            : extraClassNameAttr;
        }

        const hasRestSpreadAttr = keptRestAfterVariants.some(
          (attr) => attr.type === "JSXSpreadAttribute",
        );
        const hasOnlyStaticInlineStyleAttr =
          staticInlineStyleExpr !== null &&
          styleAttr !== null &&
          effectiveClassNameAttr === null &&
          !hasCallerStyleAttr &&
          !hasRestSpreadAttr;
        const needsMerge =
          effectiveClassNameAttr !== null || (styleAttr !== null && !hasOnlyStaticInlineStyleAttr);
        // sx prop requires at least one local stylex.create() reference so the
        // StyleX compiler can verify and transform it. When all styles are external
        // (e.g. only extraStylexPropsArgs mixin lookups), fall back to stylex.props().
        const stylesId = ctx.stylesIdentifier ?? "styles";
        const mergedStyleArgs = mergeAdjacentComplementaryStyleExprs(j, styleArgs);
        const hasLocalStyleRef = mergedStyleArgs.some(
          (arg) => j([arg]).find(j.Identifier, { name: stylesId }).size() > 0,
        );
        // sx-aware wrapped components: always emit `sx={...}` and let the
        // wrapped component merge className/style itself. The original
        // className/style JSX attributes are forwarded unchanged.
        const useSxPropForWrapped =
          ctx.adapter.useSxProp && wrappedAcceptsSxProp && hasLocalStyleRef;
        const useSxProp =
          useSxPropForWrapped ||
          (ctx.adapter.useSxProp && !needsMerge && isIntrinsicTag && hasLocalStyleRef);
        // Compose any caller-supplied `sx={...}` JSX attribute into the emitted
        // sx expression so the caller's styles are preserved (would otherwise be
        // silently overwritten by the new `sx={...}` attribute).
        const callerSxExpr =
          sxAttr &&
          sxAttr.type === "JSXAttribute" &&
          sxAttr.value?.type === "JSXExpressionContainer"
            ? (sxAttr.value.expression as ExpressionKind)
            : null;
        const stylexAttr = useSxProp
          ? (() => {
              const allArgs: ExpressionKind[] = callerSxExpr
                ? [...mergedStyleArgs, callerSxExpr]
                : [...mergedStyleArgs];
              const sxExpr =
                allArgs.length === 1 && allArgs[0] ? allArgs[0] : j.arrayExpression(allArgs);
              return j.jsxAttribute(j.jsxIdentifier("sx"), j.jsxExpressionContainer(sxExpr));
            })()
          : j.jsxSpreadAttribute(
              needsMerge
                ? buildInlineMergeCall(
                    j,
                    mergedStyleArgs,
                    effectiveClassNameAttr,
                    styleAttr,
                    ctx.adapter.styleMerger?.functionName,
                  )
                : j.callExpression(
                    j.memberExpression(j.identifier("stylex"), j.identifier("props")),
                    [...mergedStyleArgs],
                  ),
            );

        // For sx prop mode, emit extraClassNames as a separate className attribute
        // (sx and className are independent and don't conflict).
        const extraClassNameAttrs: typeof keptRestAfterVariants = [];
        if (extraClassNameExpr && useSxProp) {
          extraClassNameAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier("className"),
              j.jsxExpressionContainer(extraClassNameExpr),
            ),
          );
        }

        // For sx-aware wrapped components, keep className/style attributes
        // unchanged — the wrapped component handles merging them with `sx`.
        const passThroughClassName = useSxPropForWrapped && classNameAttr ? [classNameAttr] : [];
        const passThroughStyle = useSxPropForWrapped && styleAttr ? [styleAttr] : [];
        // When not using the sx-prop fast path, restore any caller-supplied
        // `sx={...}` attribute so it isn't silently dropped (we extracted it
        // above to compose it into the emitted sx expression in the sx path).
        const passThroughSx = !useSxProp && sxAttr ? [sxAttr] : [];

        const finalRest = [
          ...keptRestAfterVariants.slice(0, finalInsertIndex),
          stylexAttr,
          ...extraClassNameAttrs,
          ...passThroughClassName,
          ...passThroughStyle,
          ...passThroughSx,
          ...keptRestAfterVariants.slice(finalInsertIndex),
        ];

        // Final order: leading attrs, rest (with stylex.props/merge call inserted).
        // When merge call is used, className/style are already folded into the call.
        opening.attributes = [
          ...keptLeadingAfterVariants,
          ...finalRest,
          ...(styleAttr && !needsMerge && !useSxPropForWrapped ? [styleAttr] : []),
        ];
        preserveInlineJsxTextWhitespace(ctx, p, styledDecls);
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
