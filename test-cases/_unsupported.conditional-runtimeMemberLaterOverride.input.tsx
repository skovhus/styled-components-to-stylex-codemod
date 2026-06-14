// @expected-warning: Unsupported interpolation: call expression
// A later physical side partially overriding an earlier runtime logical shorthand
// branch (the fixture adapter emits logical `marginBlock`/`marginInline`) is
// writing-mode ambiguous: `margin-top` removes the block-start side in
// horizontal-tb but the inline-start side in vertical writing modes. Without the
// element's writing-mode the subtraction cannot be done losslessly, so bail.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  margin: ${Browser.isTouchDevice ? 4 : 8}px 12px;
  margin-top: 0;
  background-color: peachpuff;
`;

export const App = () => <Box>Later margin-top wins</Box>;
