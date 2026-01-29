import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

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
    if (decl.isCssHelper && ctx.exportedComponents?.has(decl.localName)) {
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
    if (decl.needsWrapperComponent) {
      // If this is a sibling-selector wrapper, add boolean props to each usage based on
      // sibling position (adjacent) and class marker (general sibling).
      if (decl.siblingWrapper) {
        const sw = decl.siblingWrapper;
        const ensureBoolAttr = (opening: any, name: string) => {
          const attrs = (opening.attributes ?? []) as any[];
          if (
            attrs.some(
              (a) =>
                a.type === "JSXAttribute" &&
                a.name?.type === "JSXIdentifier" &&
                a.name.name === name,
            )
          ) {
            return;
          }
          opening.attributes = [...attrs, j.jsxAttribute(j.jsxIdentifier(name), null)];
        };

        const hasClass = (opening: any, cls: string): boolean => {
          const attrs = (opening.attributes ?? []) as any[];
          for (const a of attrs) {
            if (a.type !== "JSXAttribute") {
              continue;
            }
            if (a.name?.type !== "JSXIdentifier") {
              continue;
            }
            if (a.name.name !== "className") {
              continue;
            }
            const v: any = a.value;
            if (!v) {
              continue;
            }
            if (v.type === "Literal" && typeof v.value === "string") {
              return v.value.split(/\s+/).includes(cls);
            }
            if (v.type === "StringLiteral") {
              return v.value.split(/\s+/).includes(cls);
            }
          }
          return false;
        };

        const visitJsx = (node: any) => {
          if (!node || typeof node !== "object") {
            return;
          }
          if (node.type === "JSXElement") {
            const children: any[] = node.children ?? [];
            let seenPrevThing = false;
            let afterActive = false;
            for (const child of children) {
              if (!child || child.type !== "JSXElement") {
                continue;
              }
              const name = child.openingElement?.name;
              if (name?.type !== "JSXIdentifier") {
                continue;
              }
              if (name.name === decl.localName) {
                if (seenPrevThing) {
                  ensureBoolAttr(child.openingElement, sw.propAdjacent);
                }
                if (sw.afterClass && hasClass(child.openingElement, sw.afterClass)) {
                  afterActive = true;
                } else if (afterActive && sw.propAfter) {
                  ensureBoolAttr(child.openingElement, sw.propAfter);
                }
                // Once we hit the first Thing, all later Things are adjacent siblings in this group.
                seenPrevThing = true;
              } else {
                // recurse into nested JSX
                visitJsx(child);
              }
            }
          }
        };

        root.find(j.JSXElement).forEach((p) => visitJsx(p.node));
      }

      continue;
    }

    // If we emitted a wrapper for this decl, keep JSX usage as `<Decl ... />`.
    // Inline substitution (`<Decl>` -> `<tag>`) is only valid when the styled declaration
    // is removed and there is no wrapper component boundary to preserve.
    if (decl.needsWrapperComponent) {
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

        // Handle `as="tag"` (styled-components polymorphism) by rewriting the element.
        const attrs = opening.attributes ?? [];
        for (const attr of attrs) {
          if (attr.type !== "JSXAttribute") {
            continue;
          }
          if (attr.name.type !== "JSXIdentifier") {
            continue;
          }
          const attrName = attr.name.name;
          if (attrName !== "as" && attrName !== "forwardedAs") {
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
            return j.jsxMemberExpression(
              j.jsxIdentifier(parts[0]!),
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
              return false;
            }
            if (
              decl.shouldForwardProp.dropPrefix &&
              n.startsWith(decl.shouldForwardProp.dropPrefix)
            ) {
              return false;
            }
          }
          return attr.name.name !== "as" && attr.name.name !== "forwardedAs";
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
                  : j.literal(String(v));
            keptAttrs.unshift(j.jsxAttribute(j.jsxIdentifier(k), valNode as any));
          }
        }

        // Preserve original prop order to maintain override semantics:
        // - Explicit attrs before any spread → leading (before stylex.props)
        // - Spread attrs → middle (before stylex.props, after leading)
        // - Explicit attrs after a spread → trailing (after stylex.props, to preserve overrides)
        // - `style` attr → always last (for inline overrides)
        const leading: typeof keptAttrs = [];
        const spreads: typeof keptAttrs = [];
        const trailing: typeof keptAttrs = [];
        let seenSpread = false;
        for (const attr of keptAttrs) {
          if (attr.type === "JSXSpreadAttribute") {
            spreads.push(attr);
            seenSpread = true;
          } else if (
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            attr.name.name === "style"
          ) {
            // `style` attribute always goes last to allow inline overrides
            trailing.push(attr);
          } else if (seenSpread) {
            // Explicit attrs after a spread go to trailing to preserve override semantics
            trailing.push(attr);
          } else {
            // Explicit attrs before any spread go to leading
            leading.push(attr);
          }
        }

        // Insert {...stylex.props(styles.key)} after structural attrs like href/type/size (matches fixtures).
        const extraStyleArgs = (decl.extraStyleKeys ?? []).map((key) =>
          j.memberExpression(j.identifier(ctx.stylesIdentifier ?? "styles"), j.identifier(key)),
        );
        const styleArgs: any[] = [
          ...(decl.extendsStyleKey
            ? [
                j.memberExpression(
                  j.identifier(ctx.stylesIdentifier ?? "styles"),
                  j.identifier(decl.extendsStyleKey),
                ),
              ]
            : []),
          ...extraStyleArgs,
          j.memberExpression(
            j.identifier(ctx.stylesIdentifier ?? "styles"),
            j.identifier(decl.styleKey),
          ),
        ];

        const variantKeys = decl.variantStyleKeys ?? {};
        const variantProps = new Set(Object.keys(variantKeys));
        const keptLeadingAfterVariants: typeof leading = [];
        const keptTrailingAfterVariants: typeof trailing = [];
        const styleFnPairs = decl.styleFnFromProps ?? [];
        const styleFnProps = new Set(styleFnPairs.map((p) => p.jsxProp));

        // Helper to process attrs (strip variants, transient props, styleFn props)
        const processAttr = (attr: (typeof leading)[0], output: typeof leading) => {
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") {
            output.push(attr);
            return;
          }
          const n = attr.name.name;

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

          if (!variantProps.has(n)) {
            // Strip transient props (starting with $) only for intrinsic elements.
            // For styled(Component), transient props should still reach the wrapped component
            // (unless consumed by styleFnFromProps, which is handled above).
            if (n.startsWith("$") && decl.base.kind === "intrinsic") {
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
          // Any other value shape: drop the prop without attempting to apply a variant.
        };

        // Process leading attrs (before any spread)
        for (const attr of leading) {
          processAttr(attr, keptLeadingAfterVariants);
        }

        // Process trailing attrs (after a spread) - same filtering applies
        for (const attr of trailing) {
          processAttr(attr, keptTrailingAfterVariants);
        }

        // Final order: leading attrs, spreads, stylex.props(), trailing attrs
        opening.attributes = [
          ...keptLeadingAfterVariants,
          ...spreads,
          j.jsxSpreadAttribute(
            j.callExpression(j.memberExpression(j.identifier("stylex"), j.identifier("props")), [
              ...styleArgs,
            ]),
          ),
          ...keptTrailingAfterVariants,
        ];
      });
  }

  return CONTINUE;
}
