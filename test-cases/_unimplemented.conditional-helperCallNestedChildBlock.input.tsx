// @expected-warning: Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules
// Standalone helper-call interpolation INSIDE a `${Child}` block that is itself
// inside a parent pseudo. The rule processor lowers `prop: value` lines inside
// the `${Child}` block via the CSS var bridge, but it does not lower standalone
// `${(props) => helper()}` interpolations there — and the conditional-helper
// resolver in finalize-decl can't preserve the inner child selector context.
// The codemod must bail rather than silently drop the styles or apply them to
// the wrong target.
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const TextLabel = styled.span`
  font-weight: bold;
`;

const NestedHover = styled.div<{ $truncate?: boolean }>`
  padding: 8px;

  &:hover {
    ${TextLabel} {
      ${(props) => (props.$truncate ? truncate() : "")}
    }
  }
`;

export const App = () => (
  <NestedHover $truncate>
    <TextLabel>Hover me - inner label gets truncated via nested helper call</TextLabel>
  </NestedHover>
);
