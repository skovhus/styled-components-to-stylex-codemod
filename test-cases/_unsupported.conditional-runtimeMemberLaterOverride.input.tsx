// @expected-warning: Unsupported interpolation: call expression
// A later declaration for the same property must not be overridden by an earlier runtime branch.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${Browser.isTouchDevice ? 5 : 1}px;
  top: 2px;
  background-color: peachpuff;
`;

export const App = () => <Box>Later top wins</Box>;
