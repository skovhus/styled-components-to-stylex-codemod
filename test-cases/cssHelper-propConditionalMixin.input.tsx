// Standalone css helper whose template branches on component props, reused as a mixin.
// The helper's conditional variant (width: 100px when $big) is inlined into each consuming
// component at the `${sizing}` reference site, so the prop-dependent styles are preserved as
// per-consumer conditional style refs. Covers multiple consumers of the same helper.
import styled, { css } from "styled-components";

const sizing = css<{ $big?: boolean }>`
  width: ${(p) => (p.$big ? "100px" : "50px")};
`;

const Tile = styled.div<{ $big?: boolean }>`
  ${sizing}
  background-color: lightsteelblue;
  padding: 8px;
`;

// Second consumer of the same helper: the conditional is inlined independently per consumer.
const Panel = styled.div<{ $big?: boolean }>`
  ${sizing}
  background-color: peachpuff;
  height: 40px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tile $big>Big tile (100px)</Tile>
    <Tile>Small tile (50px)</Tile>
    <Panel $big>Big panel</Panel>
    <Panel>Small panel</Panel>
  </div>
);
