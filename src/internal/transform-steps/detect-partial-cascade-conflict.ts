/**
 * Step: detect partial-file cascade conflicts. Bails when an extending (leaf)
 * styled component was transformed to StyleX while its base (non-leaf) was left
 * as styled-components.
 *
 * Why this direction and not the other:
 *
 *  - styled-components injects its CSS at runtime, AFTER StyleX's precompiled
 *    atomic CSS is already in the stylesheet.
 *  - When an extending styled-component stays as `styled(Base)\`...\`` but its
 *    Base is converted to StyleX, at runtime the element carries both the
 *    StyleX atomic classes AND the styled-components class from the leaf.
 *    Styled-components CSS arrives last, so its leaf-scoped overrides win.
 *    This is "styled-components restyling StyleX" and preserves the cascade.
 *  - The opposite — StyleX leaf wrapping a styled-components base — is unsafe:
 *    StyleX classes carry the leaf's overrides, styled-components CSS is
 *    injected later for the base, and the base's rules can win against the
 *    leaf's intended overrides depending on property overlap. This is
 *    "StyleX restyling styled-components" and we bail to avoid surprise.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { styledDeclsHaveDisjointStyleProps } from "../utilities/cascade-disjoint.js";

export function detectPartialCascadeConflictStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || styledDecls.length === 0) {
    return CONTINUE;
  }

  const hasSkipped = styledDecls.some((d) => d.skipTransform);
  if (!hasSkipped) {
    return CONTINUE;
  }

  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));

  for (const derived of styledDecls) {
    // Unsafe direction: leaf (extending) converts to StyleX but base (non-leaf)
    // stays as styled-components. Iterate transformed decls and check whether
    // their local base is a skipped styled-component.
    if (derived.skipTransform) {
      continue;
    }
    if (derived.base.kind !== "component") {
      continue;
    }
    const baseDecl = declByLocalName.get(derived.base.ident);
    if (!baseDecl || !baseDecl.skipTransform) {
      continue;
    }
    // Experimental migration adapter mode: allow the StyleX leaf to restyle the
    // styled-components base when their declared property sets are provably
    // disjoint, so no property conflict can cross the boundary. Restricted to a
    // base that does not itself extend another component, whose full styling we
    // cannot see from this step.
    if (
      ctx.options.allowStyleXOverStyledComponents &&
      baseDecl.base.kind === "intrinsic" &&
      styledDeclsHaveDisjointStyleProps(derived, baseDecl)
    ) {
      continue;
    }
    ctx.warnings.push({
      severity: "warning",
      type: "Partial transform would have a StyleX leaf wrap a styled-components base — the extending component was transformed but its base was not, so the leaf's StyleX overrides cannot reliably beat the base's styled-components styles",
      loc: derived.loc,
      context: {
        leaf: derived.localName,
        base: baseDecl.localName,
      },
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}
