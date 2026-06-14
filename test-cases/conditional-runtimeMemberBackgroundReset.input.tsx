// A later multi-component background shorthand resets background-color to
// transparent, so the earlier runtime-conditional background-color branch is
// dead and must be subtracted (not kept as a variant that overrides the reset).
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  background-color: ${Browser.isTouchDevice ? "red" : "blue"};
  background: url("/asset.svg") no-repeat center;
  width: 80px;
  height: 40px;
`;

export const App = () => <Box>Background reset</Box>;
