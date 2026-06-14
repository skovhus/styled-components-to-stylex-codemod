// A later longhand declaration wins over the earlier runtime shorthand branch for that side.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  margin: ${Browser.isTouchDevice ? 4 : 8}px 12px;
  margin-top: 0;
  background-color: peachpuff;
`;

// A logical inline shorthand branch partially overridden by a physical side: the
// surviving side is the deterministic physical `margin-right`, so the remainder
// must be emitted physically (not as logical `margin-inline-end`, which targets
// the left side in RTL).
const InlineBox = styled.div`
  margin-inline: ${Browser.isTouchDevice ? 8 : 4}px;
  margin-left: 0;
  background-color: lightblue;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Box>Later margin-top wins</Box>
    <InlineBox>Later margin-left wins</InlineBox>
  </div>
);
