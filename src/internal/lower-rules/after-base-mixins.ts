/**
 * Post-processes after-base css`` mixins to preserve CSS cascade semantics.
 * Core concepts: patching contextual defaults and pruning replaced helper keys.
 */
import { capitalize } from "../utilities/string-utils.js";
import { isAstNode } from "../utilities/jscodeshift-utils.js";
import type { StyledDecl } from "../transform-types.js";
import type { LowerRulesState } from "./state.js";

export function postProcessAfterBaseMixins(state: LowerRulesState): void {
  const { styledDecls, resolvedStyleObjects, warnings } = state;

  // ---------------------------------------------------------------------------
  // Conservative fix: patch contextual defaults for after-base css`` mixins
  // ---------------------------------------------------------------------------
  //
  // When a css`` helper is applied after a component's base styles (via extraStyleKeysAfterBase),
  // any contextual property map like `{ default: null, ":hover": "blue" }` will *unset* the base
  // value in StyleX merging semantics. In styled-components, a pseudo-only mixin does not remove
  // base styles; it only overrides within the pseudo state.
  //
  // To preserve semantics safely, we create a per-use derived style object where we replace
  // `default: null` with a statically-known base value for that property (if available). If the
  // base value is present but non-literal, we bail (conservative).
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !isAstNode(v) && !Array.isArray(v);

  // Css helper style keys that we replaced with per-use derived keys and may be prunable.
  const prunableCssHelperKeys = new Set<string>();

  const getStaticBaseValueForProp = (
    decl: StyledDecl,
    prop: string,
  ): { kind: "literal"; value: string | number } | { kind: "none" } | { kind: "nonLiteral" } => {
    const readLiteral = (obj: unknown): string | number | null | undefined => {
      if (!isPlainObject(obj)) {
        return undefined;
      }
      const v = obj[prop];
      return typeof v === "string" || typeof v === "number" || v === null ? v : undefined;
    };

    // Simulate the pre-base merge order used by rewrite-jsx:
    // extendsStyleKey -> extraStyleKeys (excluding afterBase) -> base styleKey
    let last: string | number | null | undefined = undefined;
    if (decl.extendsStyleKey) {
      last = readLiteral(resolvedStyleObjects.get(decl.extendsStyleKey));
    }

    const afterBase = new Set(decl.extraStyleKeysAfterBase ?? []);
    for (const key of decl.extraStyleKeys ?? []) {
      if (afterBase.has(key)) {
        continue;
      }
      const v = readLiteral(resolvedStyleObjects.get(key));
      if (v !== undefined) {
        last = v;
      }
    }

    const baseV = readLiteral(resolvedStyleObjects.get(decl.styleKey));
    if (baseV !== undefined) {
      last = baseV;
    }

    if (last === undefined || last === null) {
      return { kind: "none" };
    }
    if (typeof last === "string" || typeof last === "number") {
      return { kind: "literal", value: last };
    }
    return { kind: "nonLiteral" };
  };

  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
    const afterBaseKeys = decl.extraStyleKeysAfterBase ?? [];
    if (afterBaseKeys.length === 0) {
      continue;
    }

    for (const mixinKey of afterBaseKeys) {
      const mixinStyle = resolvedStyleObjects.get(mixinKey);
      if (!isPlainObject(mixinStyle)) {
        state.markBail();
        warnings.push({
          severity: "warning",
          type: "Unsupported css`` mixin: after-base mixin style is not a plain object",
          loc: decl.loc,
          context: { component: decl.localName, mixinKey },
        });
        break;
      }

      let didPatch = false;
      const patched: Record<string, unknown> = { ...mixinStyle };

      for (const [prop, v] of Object.entries(mixinStyle)) {
        if (!isPlainObject(v)) {
          continue;
        }
        if (!("default" in v)) {
          continue;
        }
        // Only patch the unsafe case: explicit `default: null`.
        if ((v as Record<string, unknown>).default !== null) {
          continue;
        }
        // Bail on nested condition objects (conservative).
        for (const condVal of Object.values(v)) {
          if (isPlainObject(condVal)) {
            state.markBail();
            warnings.push({
              severity: "warning",
              type: "Unsupported css`` mixin: nested contextual conditions in after-base mixin",
              loc: decl.loc,
              context: { component: decl.localName, mixinKey, prop },
            });
            break;
          }
        }
        if (state.bail) {
          break;
        }

        const base = getStaticBaseValueForProp(decl, prop);
        if (base.kind === "literal") {
          patched[prop] = { ...(v as Record<string, unknown>), default: base.value };
          didPatch = true;
        } else if (base.kind === "nonLiteral") {
          state.markBail();
          warnings.push({
            severity: "warning",
            type: "Unsupported css`` mixin: cannot infer base default for after-base contextual override (base value is non-literal)",
            loc: decl.loc,
            context: { component: decl.localName, mixinKey, prop },
          });
          break;
        } else {
          // No base value: leaving default:null is semantically fine.
        }
      }

      if (state.bail) {
        break;
      }
      if (!didPatch) {
        continue;
      }

      const derivedKey = `${mixinKey}In${capitalize(decl.styleKey)}`;
      // Avoid collisions if multiple passes create the same key.
      if (!resolvedStyleObjects.has(derivedKey)) {
        resolvedStyleObjects.set(derivedKey, patched);
      }
      prunableCssHelperKeys.add(mixinKey);

      // Replace this mixin key with the derived key, preserving ordering.
      if (decl.extraStyleKeys) {
        decl.extraStyleKeys = decl.extraStyleKeys.map((k) => (k === mixinKey ? derivedKey : k));
      }
      if (decl.extraStyleKeysAfterBase) {
        decl.extraStyleKeysAfterBase = decl.extraStyleKeysAfterBase.map((k) =>
          k === mixinKey ? derivedKey : k,
        );
      }
    }
    if (state.bail) {
      break;
    }
  }

  // Prune only css helpers that we replaced with derived per-use keys.
  // This avoids generating unused StyleX styles (stylex/no-unused) while not interfering with
  // standalone css helpers that may be referenced directly in user code.
  if (!state.bail && prunableCssHelperKeys.size > 0) {
    const referencedKeys = new Set<string>();
    for (const d of styledDecls) {
      if (d.isCssHelper) {
        continue;
      }
      referencedKeys.add(d.styleKey);
      if (d.extendsStyleKey) {
        referencedKeys.add(d.extendsStyleKey);
      }
      for (const k of d.extraStyleKeys ?? []) {
        referencedKeys.add(k);
      }
      for (const k of Object.values(d.variantStyleKeys ?? {})) {
        referencedKeys.add(k);
      }
      if (d.enumVariant) {
        referencedKeys.add(d.enumVariant.baseKey);
        for (const c of d.enumVariant.cases) {
          referencedKeys.add(c.styleKey);
        }
      }
      if (d.attrWrapper) {
        if (d.attrWrapper.checkboxKey) {
          referencedKeys.add(d.attrWrapper.checkboxKey);
        }
        if (d.attrWrapper.radioKey) {
          referencedKeys.add(d.attrWrapper.radioKey);
        }
        if (d.attrWrapper.disabledKey) {
          referencedKeys.add(d.attrWrapper.disabledKey);
        }
        if (d.attrWrapper.readonlyKey) {
          referencedKeys.add(d.attrWrapper.readonlyKey);
        }
        if (d.attrWrapper.externalKey) {
          referencedKeys.add(d.attrWrapper.externalKey);
        }
        if (d.attrWrapper.httpsKey) {
          referencedKeys.add(d.attrWrapper.httpsKey);
        }
        if (d.attrWrapper.pdfKey) {
          referencedKeys.add(d.attrWrapper.pdfKey);
        }
      }
    }

    for (const key of prunableCssHelperKeys) {
      const helperDecl = styledDecls.find((d) => d.isCssHelper && d.styleKey === key);
      if (!helperDecl) {
        continue;
      }
      if (helperDecl.isExported || helperDecl.preserveCssHelperDeclaration) {
        continue;
      }
      if (referencedKeys.has(key)) {
        continue;
      }
      resolvedStyleObjects.set(key, {});
    }
  }
}
