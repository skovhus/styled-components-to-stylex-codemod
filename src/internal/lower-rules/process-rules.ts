/**
 * Processes per-rule selector logic and dispatches declarations.
 * Core concepts: selector normalization, attribute wrappers, and rule buckets.
 */
import type { DeclProcessingState } from "./decl-setup.js";
import { computeSelectorWarningLoc } from "../css-ir.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { addPropComments } from "./comments.js";
import { processRuleDeclarations } from "./process-rule-declarations.js";
import { toKebab } from "./utils.js";
import {
  normalizeSelectorForInputAttributePseudos,
  normalizeInterpolatedSelector,
  parseSelector,
} from "../selectors.js";
import { extractRootAndPath, getNodeLocStart } from "../utilities/jscodeshift-utils.js";
import { cssValueToJs, toStyleKey } from "../transform/helpers.js";

export function processDeclRules(ctx: DeclProcessingState): void {
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    perPropMedia,
    perPropComputedMedia,
    nestedSelectors,
    attrBuckets,
    localVarValues,
    cssHelperPropValues,
    getComposedDefaultValue,
    resolveComposedDefaultValue,
  } = ctx;
  const {
    j,
    warnings,
    resolverImports,
    resolveSelector,
    parseExpr,
    cssHelperNames,
    resolvedStyleObjects,
    declByLocalName,
    cssHelperValuesByKey,
    mixinValuesByKey,
    descendantOverridePseudoBuckets,
    descendantOverrides,
    ancestorSelectorParents,
    resolveThemeValue,
    resolveThemeValueFromFn,
    resolveImportInScope,
  } = state;

  for (const rule of decl.rules) {
    if (state.bail) {
      break;
    }
    // Track resolved selector media for this rule (set by adapter.resolveSelector)
    let resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null = null;

    // --- Unsupported complex selector detection ---
    // We bail out rather than emitting incorrect unconditional styles.
    //
    // Examples we currently cannot represent safely:
    // - Grouped selectors: `&:hover, &:focus { ... }`
    // - Compound class selectors: `&.card.highlighted { ... }`
    // - Class-conditioned rules: `&.active { ... }` (requires runtime class/prop gating)
    // - Descendant element selectors: `& a { ... }`, `& h1, & h2 { ... }`
    // - Chained pseudos like `:not(...)`
    //
    // NOTE: normalize interpolated component selectors before the complex selector checks
    // to avoid skipping bails for selectors like `${Other} .child &`.
    if (typeof rule.selector === "string") {
      const s = normalizeInterpolatedSelector(rule.selector).trim();
      const hasComponentExpr = rule.selector.includes("__SC_EXPR_");
      const hasInterpolatedPseudo = /:[^\s{]*__SC_EXPR_\d+__/.test(rule.selector);

      if (hasInterpolatedPseudo) {
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: interpolated pseudo selector",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      }

      // Component selector patterns that have special handling below:
      // 1. `${Other}:hover &` - requires :hover and ends with &
      // 2. `&:hover ${Child}` or just `& ${Child}` - starts with & and contains component
      // Other component selector patterns (like `${Other} .child`) should bail.
      const isHandledComponentPattern =
        hasComponentExpr &&
        (rule.selector.includes(":hover") ||
          rule.selector.trim().startsWith("&") ||
          /^__SC_EXPR_\d+__\s*\{/.test(rule.selector.trim()));

      // Use heuristic-based bail checks. We need to allow:
      // - Component selectors that have special handling
      // - Attribute selectors (have special handling for input type, href, etc.)
      // Note: Specificity hacks (&&, &&&) bail early in transform.ts

      // Check for descendant pseudo selectors BEFORE normalization collapses them.
      // "& :not(:disabled)" (with space) targets descendants, not the component itself.
      // normalizeInterpolatedSelector would collapse this to "&:not(:disabled)" which
      // has completely different semantics. We must bail on these patterns.
      if (/&\s+:/.test(rule.selector)) {
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: descendant pseudo selector (space before pseudo)",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      }

      if (s.includes(",") && !isHandledComponentPattern) {
        // Comma-separated selectors: bail unless ALL parts are valid pseudo-selectors
        const parsed = parseSelector(s);
        if (parsed.kind !== "pseudo") {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: comma-separated selectors must all be simple pseudos",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }
      } else if (/&\.[a-zA-Z0-9_-]+/.test(s)) {
        // Class selector on same element like &.active
        // Note: Specificity hacks (&&, &&&) bail early in transform.ts
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: class selector",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      } else if (/[+~]/.test(s) && !isHandledComponentPattern) {
        // Sibling combinators like `& + &`, `& ~ &`
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: sibling combinator",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      } else if (/\s+[a-zA-Z.#]/.test(s) && !isHandledComponentPattern) {
        // Descendant element/class/id selectors like `& a`, `& .child`, `& #foo`
        // But NOT `&:hover ${Child}` (component selector pattern)
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: descendant/child/sibling selector",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      }
    }

    // Component selector emulation and other rule handling continues...
    // NOTE: This function intentionally mirrors existing logic from `transform.ts`.

    if (typeof rule.selector === "string" && rule.selector.includes("__SC_EXPR_")) {
      const slotMatch = rule.selector.match(/__SC_EXPR_(\d+)__/);
      const slotId = slotMatch ? Number(slotMatch[1]) : null;
      const slotExpr = slotId !== null ? (decl.templateExpressions[slotId] as any) : null;
      const otherLocal = slotExpr?.type === "Identifier" ? (slotExpr.name as string) : null;
      const isCssHelperPlaceholder = !!otherLocal && cssHelperNames.has(otherLocal);

      const selTrim2 = rule.selector.trim();

      // `${Other}:hover &` (Icon reacting to Link hover)
      if (
        otherLocal &&
        !isCssHelperPlaceholder &&
        selTrim2.startsWith("__SC_EXPR_") &&
        rule.selector.includes(":hover") &&
        rule.selector.includes("&")
      ) {
        const parentDecl = declByLocalName.get(otherLocal);
        const parentStyle = parentDecl && resolvedStyleObjects.get(parentDecl.styleKey);
        if (parentStyle) {
          for (const d of rule.declarations) {
            if (d.value.kind !== "static") {
              continue;
            }
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              if (out.value.kind !== "static") {
                continue;
              }
              const hoverValue = out.value.value;
              const rawBase = (styleObj as any)[out.prop] as unknown;
              let baseValue: string | null = null;
              if (typeof rawBase === "string" || typeof rawBase === "number") {
                baseValue = String(rawBase);
              } else if (cssHelperPropValues.has(out.prop)) {
                const helperDefault = getComposedDefaultValue(out.prop);
                if (typeof helperDefault === "string" || typeof helperDefault === "number") {
                  baseValue = String(helperDefault);
                }
              } else if (parentDecl) {
                const parentValues = parentDecl.isCssHelper
                  ? cssHelperValuesByKey.get(parentDecl.styleKey)
                  : mixinValuesByKey.get(parentDecl.styleKey);
                const parentValue = resolveComposedDefaultValue(
                  parentValues?.get(out.prop),
                  out.prop,
                );
                if (typeof parentValue === "string" || typeof parentValue === "number") {
                  baseValue = String(parentValue);
                }
              }
              const varName = `--sc2sx-${toKebab(decl.localName)}-${toKebab(out.prop)}`;
              (parentStyle as any)[varName] = {
                default: baseValue ?? null,
                ":hover": hoverValue,
              };
              styleObj[out.prop] = `var(${varName}, ${baseValue ?? "inherit"})`;
            }
          }
        }
        continue;
      }

      // `${Child}` / `&:hover ${Child}` / `&:focus-visible ${Child}` (Parent styling a descendant child)
      // Also handle standalone `__SC_EXPR_N__` selectors (no `&` prefix) which Stylis
      // produces when the component selector is used without `&` in the template.
      const isComponentSelectorPattern =
        selTrim2.startsWith("&") || /^__SC_EXPR_\d+__$/.test(selTrim2);
      if (otherLocal && !isCssHelperPlaceholder && isComponentSelectorPattern) {
        const childDecl = declByLocalName.get(otherLocal);
        // Extract the actual pseudo-selector (e.g., ":hover", ":focus-visible")
        const pseudoMatch = rule.selector.match(/&(:[a-z-]+(?:\([^)]*\))?)/i);
        const ancestorPseudo: string | null = pseudoMatch?.[1] ?? null;
        if (!childDecl) {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: unknown component selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }
        if (childDecl) {
          const overrideStyleKey = `${toStyleKey(otherLocal)}In${decl.localName}`;
          ancestorSelectorParents.add(decl.styleKey);
          // Only add to descendantOverrides once per override key
          if (!descendantOverridePseudoBuckets.has(overrideStyleKey)) {
            descendantOverrides.push({
              parentStyleKey: decl.styleKey,
              childStyleKey: childDecl.styleKey,
              overrideStyleKey,
            });
          }
          // Get or create the pseudo buckets map for this override key
          let pseudoBuckets = descendantOverridePseudoBuckets.get(overrideStyleKey);
          if (!pseudoBuckets) {
            pseudoBuckets = new Map();
            descendantOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
          }
          // Get or create the bucket for this specific pseudo (or null for base)
          let bucket = pseudoBuckets.get(ancestorPseudo);
          if (!bucket) {
            bucket = {};
            pseudoBuckets.set(ancestorPseudo, bucket);
          }

          for (const d of rule.declarations) {
            // Handle static values
            if (d.value.kind === "static") {
              for (const out of cssDeclarationToStylexDeclarations(d)) {
                if (out.value.kind !== "static") {
                  continue;
                }
                const v = cssValueToJs(out.value, d.important, out.prop);
                (bucket as Record<string, unknown>)[out.prop] = v;
              }
            } else if (d.value.kind === "interpolated" && d.property) {
              // Handle interpolated theme values (e.g., ${props => props.theme.color.labelBase})
              const slotPart = (
                d.value as { parts?: Array<{ kind: string; slotId?: number }> }
              ).parts?.find((p) => p.kind === "slot");
              if (slotPart && slotPart.slotId !== undefined) {
                const expr = decl.templateExpressions[slotPart.slotId] as unknown;
                const resolved =
                  expr &&
                  typeof expr === "object" &&
                  ((expr as { type?: string }).type === "ArrowFunctionExpression" ||
                    (expr as { type?: string }).type === "FunctionExpression")
                    ? resolveThemeValueFromFn(expr)
                    : resolveThemeValue(expr);
                if (resolved) {
                  for (const out of cssDeclarationToStylexDeclarations(d)) {
                    // Build the value: preserve the order of static and interpolated parts
                    const parts =
                      (d.value as { parts?: Array<{ kind: string; value?: string }> }).parts ?? [];
                    const hasStaticParts = parts.some((p) => p.kind === "static" && p.value);
                    let finalValue: unknown;
                    if (hasStaticParts) {
                      // Build a proper template literal preserving the order of parts
                      const quasis: any[] = [];
                      const expressions: any[] = [];
                      let currentStatic = "";

                      for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        if (!part) {
                          continue;
                        }
                        if (part.kind === "static") {
                          currentStatic += part.value ?? "";
                        } else if (part.kind === "slot") {
                          // Add the accumulated static text as a quasi
                          quasis.push(
                            j.templateElement({ raw: currentStatic, cooked: currentStatic }, false),
                          );
                          currentStatic = "";
                          expressions.push(resolved);
                        }
                      }
                      // Add the final static text (may be empty)
                      quasis.push(
                        j.templateElement({ raw: currentStatic, cooked: currentStatic }, true),
                      );
                      finalValue = j.templateLiteral(quasis, expressions);
                    } else {
                      finalValue = resolved;
                    }
                    (bucket as Record<string, unknown>)[out.prop] = finalValue;
                  }
                }
              }
            }
          }
        }
        continue;
      }

      // Selector interpolation that's a MemberExpression (e.g., screenSize.phone)
      // Try to resolve it via the adapter as a media query helper.
      if (
        !otherLocal &&
        slotExpr &&
        (slotExpr.type === "MemberExpression" || slotExpr.type === "OptionalMemberExpression")
      ) {
        const info = extractRootAndPath(slotExpr);
        const identifierDesc = info
          ? info.path.length > 0
            ? `${info.rootName}.${info.path.join(".")}`
            : info.rootName
          : "unknown expression";

        // Try to resolve via adapter
        let resolved = false;
        if (info) {
          const imp = resolveImportInScope(info.rootName, info.rootNode);
          if (imp) {
            const selectorResult = resolveSelector({
              kind: "selectorInterpolation",
              importedName: imp.importedName,
              source: imp.source,
              path: info.path.length > 0 ? info.path.join(".") : undefined,
              filePath: state.filePath,
              loc: getNodeLocStart(slotExpr) ?? undefined,
            });

            if (selectorResult && selectorResult.kind === "media") {
              // Store the resolved media expression for this rule
              const mediaExpr = parseExpr(selectorResult.expr);
              if (mediaExpr) {
                resolvedSelectorMedia = { keyExpr: mediaExpr, exprSource: selectorResult.expr };
                // Add required imports
                for (const impSpec of selectorResult.imports ?? []) {
                  resolverImports.set(JSON.stringify(impSpec), impSpec);
                }
                resolved = true;
              }
            }
          }
        }

        if (!resolved) {
          // Bail: adapter couldn't resolve this selector interpolation
          state.markBail();
          warnings.push({
            severity: "error",
            type: "Unsupported selector interpolation: imported value in selector position",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
            context: { selector: rule.selector, expression: identifierDesc },
          });
          break;
        }
      }
    }

    let media = rule.atRuleStack.find((a) => a.startsWith("@media"));

    const isInputIntrinsic = decl.base.kind === "intrinsic" && decl.base.tagName === "input";
    let selector = normalizeSelectorForInputAttributePseudos(rule.selector, isInputIntrinsic);
    selector = normalizeInterpolatedSelector(selector);
    if (!media && selector.trim().startsWith("@media")) {
      media = selector.trim();
      selector = "&";
    }

    // Support comma-separated pseudo-selectors like "&:hover, &:focus"
    // and chained pseudo-selectors like "&:focus:not(:disabled)"
    const parsedSelector = parseSelector(selector);

    // Bail on unsupported selectors that weren't caught by the heuristic checks above.
    // The heuristic regex checks may miss cases where Stylis normalizes selectors differently
    // (e.g., `& > button[disabled]` becomes `&>button[disabled]` after form-feed stripping).
    if (
      parsedSelector.kind === "unsupported" &&
      selector !== "&" &&
      !rule.selector.includes("__SC_EXPR_")
    ) {
      state.markBail();
      warnings.push({
        severity: "warning",
        type: "Unsupported selector: descendant/child/sibling selector",
        loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
      });
      break;
    }

    const pseudos = parsedSelector.kind === "pseudo" ? parsedSelector.pseudos : null;
    const pseudoElement = parsedSelector.kind === "pseudoElement" ? parsedSelector.element : null;
    const attrSel =
      parsedSelector.kind === "attribute"
        ? {
            kind: parsedSelector.attr.type,
            suffix: parsedSelector.attr.suffix,
            pseudoElement: parsedSelector.attr.pseudoElement,
          }
        : null;
    const attrWrapperKind =
      decl.base.kind === "intrinsic" && decl.base.tagName === "input"
        ? "input"
        : decl.base.kind === "intrinsic" && decl.base.tagName === "a"
          ? "link"
          : null;
    const isAttrRule = !!attrSel && !!attrWrapperKind;
    let attrTarget: Record<string, unknown> | null = null;
    let attrPseudoElement: string | null = null;

    if (isAttrRule && attrSel && attrWrapperKind) {
      decl.needsWrapperComponent = true;
      decl.attrWrapper ??= { kind: attrWrapperKind };
      const suffix = attrSel.suffix;
      const attrTargetStyleKey = `${decl.styleKey}${suffix}`;
      attrTarget = attrBuckets.get(attrTargetStyleKey) ?? {};
      attrBuckets.set(attrTargetStyleKey, attrTarget);
      attrPseudoElement = attrSel.pseudoElement ?? null;

      if (attrWrapperKind === "input") {
        if (attrSel.kind === "typeCheckbox") {
          decl.attrWrapper.checkboxKey = attrTargetStyleKey;
        } else if (attrSel.kind === "typeRadio") {
          decl.attrWrapper.radioKey = attrTargetStyleKey;
        }
      } else if (attrWrapperKind === "link") {
        if (attrSel.kind === "targetBlankAfter") {
          decl.attrWrapper.externalKey = attrTargetStyleKey;
        } else if (attrSel.kind === "hrefStartsHttps") {
          decl.attrWrapper.httpsKey = attrTargetStyleKey;
        } else if (attrSel.kind === "hrefEndsPdf") {
          decl.attrWrapper.pdfKey = attrTargetStyleKey;
        }
      }
    }

    const applyResolvedPropValue = (
      prop: string,
      value: unknown,
      commentSource: { leading?: string; trailingLine?: string } | null,
    ): void => {
      if (attrTarget) {
        if (attrPseudoElement) {
          const nested = (attrTarget[attrPseudoElement] as any) ?? {};
          nested[prop] = value;
          attrTarget[attrPseudoElement] = nested;
          if (commentSource) {
            addPropComments(nested, prop, {
              leading: commentSource.leading,
              trailingLine: commentSource.trailingLine,
            });
          }
          return;
        }
        attrTarget[prop] = value;
        if (commentSource) {
          addPropComments(attrTarget, prop, {
            leading: commentSource.leading,
            trailingLine: commentSource.trailingLine,
          });
        }
        return;
      }

      if (prop && prop.startsWith("--") && typeof value === "string") {
        localVarValues.set(prop, value);
      }

      // Handle nested pseudo + media: `&:hover { @media (...) { ... } }`
      // This produces: { ":hover": { default: value, "@media (...)": value } }
      if (media && pseudos?.length) {
        perPropPseudo[prop] ??= {};
        const existing = perPropPseudo[prop]!;
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(prop)) {
            existing.default = getComposedDefaultValue(prop);
          } else {
            existing.default = null;
          }
        }
        // For each pseudo, create/update a nested media map
        for (const ps of pseudos) {
          const current = existing[ps];
          if (!current || typeof current !== "object") {
            const fallbackDefault = cssHelperPropValues.has(prop)
              ? getComposedDefaultValue(prop)
              : null;
            const preservedDefault = current !== undefined ? current : fallbackDefault;
            existing[ps] = { default: preservedDefault };
          } else if (!("default" in (current as Record<string, unknown>))) {
            const fallbackDefault = cssHelperPropValues.has(prop)
              ? getComposedDefaultValue(prop)
              : null;
            (current as Record<string, unknown>).default = fallbackDefault;
          }
          (existing[ps] as Record<string, unknown>)[media] = value;
        }
        return;
      }

      if (media) {
        perPropMedia[prop] ??= {};
        const existing = perPropMedia[prop]!;
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(prop)) {
            existing.default = getComposedDefaultValue(prop);
          } else {
            existing.default = null;
          }
        }
        existing[media] = value;
        return;
      }

      // Handle resolved selector media (from adapter.resolveSelector)
      // These use computed property keys like [breakpoints.phone]
      if (resolvedSelectorMedia) {
        let entry = perPropComputedMedia.get(prop);
        if (!entry) {
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          const defaultValue =
            existingVal !== undefined
              ? existingVal
              : cssHelperPropValues.has(prop)
                ? getComposedDefaultValue(prop)
                : null;
          entry = { defaultValue, entries: [] };
          perPropComputedMedia.set(prop, entry);
        }
        entry.entries.push({ keyExpr: resolvedSelectorMedia.keyExpr, value });
        return;
      }

      if (pseudos?.length) {
        perPropPseudo[prop] ??= {};
        const existing = perPropPseudo[prop]!;
        if (!("default" in existing)) {
          // If the property comes from a composed css helper, use the helper's
          // value as the default to preserve it during style merging.
          const existingVal = (styleObj as Record<string, unknown>)[prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(prop)) {
            existing.default = getComposedDefaultValue(prop);
          } else {
            existing.default = null;
          }
        }
        // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
        for (const ps of pseudos) {
          existing[ps] = value;
        }
        return;
      }

      if (pseudoElement) {
        nestedSelectors[pseudoElement] ??= {};
        const pseudoSelector = nestedSelectors[pseudoElement];
        if (pseudoSelector) {
          pseudoSelector[prop] = value;
          if (commentSource) {
            addPropComments(pseudoSelector, prop, {
              leading: commentSource.leading,
              trailingLine: commentSource.trailingLine,
            });
          }
        }
        return;
      }

      styleObj[prop] = value;
      if (commentSource) {
        addPropComments(styleObj, prop, {
          leading: commentSource.leading,
          trailingLine: commentSource.trailingLine,
        });
      }
    };

    processRuleDeclarations({
      ctx,
      rule,
      media,
      pseudos,
      pseudoElement,
      attrTarget,
      resolvedSelectorMedia,
      applyResolvedPropValue,
    });
    if (state.bail) {
      break;
    }
  }
}
