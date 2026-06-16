// @expected-warning: css helper with prop-based interpolation cannot be reused as a mixin
// A prop-conditional css helper that also carries a nested pseudo block. Splicing the
// helper's declarations into the consumer's `&` block cannot preserve the cascade position
// of the helper's `&:hover` rule relative to the consumer's own (later) pseudo/at-rules, so
// the codemod conservatively bails and leaves the `${interactive}` mixin reference for the
// existing mixin bail. StyleX could express this; the transform just doesn't inline helpers
// with nested rules yet.
import styled, { css } from "styled-components";

const interactive = css<{ $on?: boolean }>`
  cursor: pointer;
  opacity: ${(p) => (p.$on ? "1" : "0.5")};

  &:hover {
    background-color: gold;
  }
`;

const Toggle = styled.button<{ $on?: boolean }>`
  ${interactive}
  padding: 6px 10px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Toggle $on>On</Toggle>
    <Toggle>Off</Toggle>
  </div>
);
