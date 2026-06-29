// @expected-warning: Partial transform would leave a StyleX child reveal targeting a styled-components ancestor — the component-selector ancestor was not converted, so it cannot render the marker the child's stylex.when.ancestor() reveal needs; the child is preserved as styled-components to keep the reveal working
// Child-reveal cascade-safety guard for partial transforms:
// `Actions` reveals itself when its ancestor `Card` is hovered via the reverse
// component selector `${Card}:hover &`. Lowering that rule emits a child override
// gated on Card rendering `stylex.defaultMarker()` (matched by
// `stylex.when.ancestor(":hover")`).
//
// Here `Card` has an unsupported descendant selector (`& span.label`) and stays
// as styled-components, so it can never render the marker. Converting `Actions`
// alone would emit an unused `actionsInCard` style whose `when.ancestor(":hover")`
// never matches — the hover reveal would be silently dropped. Preserve `Actions`
// as styled-components too so the original reveal keeps working.
import styled from "styled-components";

const Card = styled.div`
  padding: 8px;
  background: papayawhip;

  & span.label {
    color: #bf4f74;
  }
`;

const Actions = styled.div`
  opacity: 0;
  padding: 4px 8px;
  background: #bf4f74;
  color: white;

  ${Card}:hover & {
    opacity: 1;
  }
`;

export function Example() {
  return (
    <Card>
      <span className="label">Label</span>
      <Actions>Actions</Actions>
    </Card>
  );
}
