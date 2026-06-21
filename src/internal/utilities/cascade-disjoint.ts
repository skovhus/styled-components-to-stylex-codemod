/**
 * Disjoint-property analysis for the experimental "migration adapter mode".
 * Core concept: a StyleX leaf may safely restyle a styled-components base only
 * when their declared CSS property sets do not overlap, so no property conflict
 * can cross the StyleX-over-styled-components boundary.
 */
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";

/**
 * Whether two styled declarations can be proven to touch disjoint CSS property
 * sets. Conservative: any unbounded styling on either side (e.g. a standalone
 * interpolation/mixin block that can inject arbitrary CSS), or any shared
 * expanded longhand property, makes them NOT provably disjoint.
 */
export function styledDeclsHaveDisjointStyleProps(a: StyledDecl, b: StyledDecl): boolean {
  const aProps = collectDeclaredStyleProps(a);
  const bProps = collectDeclaredStyleProps(b);
  if (aProps.unbounded || bProps.unbounded) {
    return false;
  }
  for (const prop of aProps.props) {
    if (bProps.props.has(prop)) {
      return false;
    }
  }
  return true;
}

// --- Non-exported helpers ---

interface DeclaredStyleProps {
  /** Expanded StyleX longhand property names declared across every rule/scope. */
  props: Set<string>;
  /**
   * True when the declaration contains styling that cannot be bound to a
   * concrete property set (a standalone interpolation/mixin block that can
   * inject arbitrary CSS). Such declarations can never be proven disjoint.
   */
  unbounded: boolean;
}

/**
 * Collect the flattened set of StyleX longhand properties a styled declaration
 * declares, expanding shorthands through the authoritative
 * `cssDeclarationToStylexDeclarations` mapping so e.g. `padding` overlaps
 * `paddingTop`. Properties are flattened across all selector scopes — a
 * conservative over-approximation: the same property used in genuinely
 * non-overlapping scopes is still treated as a potential conflict.
 */
function collectDeclaredStyleProps(decl: StyledDecl): DeclaredStyleProps {
  const props = new Set<string>();
  let unbounded = false;
  for (const rule of decl.rules) {
    for (const declaration of rule.declarations) {
      // A declaration without a property name is a standalone interpolation or
      // mixin block (`${mixin}` / `${(p) => p.x && "color: red"}`) that can
      // inject arbitrary CSS — we cannot bound what it touches.
      if (declaration.property.trim() === "") {
        unbounded = true;
        continue;
      }
      try {
        for (const expanded of cssDeclarationToStylexDeclarations(declaration)) {
          props.add(expanded.prop);
        }
      } catch {
        // If expansion fails we cannot bound the property — stay conservative.
        unbounded = true;
      }
    }
  }
  return { props, unbounded };
}
