// @expected-warning: css helper with prop-based interpolation cannot be reused as a mixin
import styled, { css } from "styled-components";

// A standalone css helper whose template branches on component props: the
// helper's conditional variant (width: 100px when $big) is not yet wired into
// consuming components, so inlining only the base style key would silently
// drop the prop-dependent styles. StyleX can express this (per-consumer
// conditional style refs), the codemod just hasn't built the transform yet.
const sizing = css<{ $big?: boolean }>`
  width: ${(p) => (p.$big ? "100px" : "50px")};
`;

const Tile = styled.div<{ $big?: boolean }>`
  ${sizing}
  background-color: lightsteelblue;
  padding: 8px;
`;

export const App = () => (
  <>
    <Tile $big>Big tile (100px)</Tile>
    <Tile>Small tile (50px)</Tile>
  </>
);
