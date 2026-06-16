// @expected-warning: css helper with prop-based interpolation cannot be reused as a mixin
// A prop-conditional css helper carrying a pseudo block, consumed by a component that
// redefines that same pseudo AFTER the `${interactive}` reference. Inlining the helper's
// `&:hover` declarations would merge them into the consumer's authored `&:hover` rule and
// flip the CSS cascade order (the consumer's later hover declaration must win), so the
// codemod bails instead of inlining. StyleX could express the correct ordering; the
// transform just does not yet preserve it across this merge.
import styled, { css } from "styled-components";

const interactive = css<{ $on?: boolean }>`
  cursor: pointer;
  opacity: ${(p) => (p.$on ? "1" : "0.5")};

  &:hover {
    background-color: gold;
  }
`;

const Card = styled.div<{ $on?: boolean }>`
  ${interactive}
  padding: 8px;

  &:hover {
    background-color: green;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Card $on>On</Card>
    <Card>Off</Card>
  </div>
);
