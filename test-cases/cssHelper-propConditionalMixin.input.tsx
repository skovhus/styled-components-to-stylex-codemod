// Standalone css helpers whose templates branch on component props, reused as mixins.
// The helper's conditional variant (e.g. width: 100px when $big) is inlined into each
// consuming component at the `${helper}` reference site, so the prop-dependent styles are
// preserved as per-consumer conditional style refs. Covers multiple consumers of one
// helper and a helper that also carries a pseudo block.
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

// Helper with a prop-conditional value plus a static pseudo block.
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
    <Tile $big>Big tile (100px)</Tile>
    <Tile>Small tile (50px)</Tile>
    <Panel $big>Big panel</Panel>
    <Panel>Small panel</Panel>
    <Toggle $on>On</Toggle>
    <Toggle>Off</Toggle>
  </div>
);
