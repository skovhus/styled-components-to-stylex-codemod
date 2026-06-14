// @expected-warning: Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand
// A multi-component `background` shorthand resets background-color, but it shares
// the component with another background declaration (the conditional
// background-color), so the expansion's reset semantics cannot be reproduced
// safely alongside the sibling — bail.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  background-color: ${Browser.isTouchDevice ? "red" : "blue"};
  background: url("/asset.svg") no-repeat center;
  width: 80px;
  height: 40px;
`;

export const App = () => <Box>Background reset</Box>;
