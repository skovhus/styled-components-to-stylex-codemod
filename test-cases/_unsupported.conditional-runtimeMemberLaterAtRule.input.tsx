// @expected-warning: Unsupported interpolation: call expression
// A later at-rule for the same selector must not be overridden by an earlier runtime branch.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${Browser.isTouchDevice ? 5 : 1}px;
  @media (min-width: 1px) {
    top: 2px;
  }
  background-color: peachpuff;
`;

export const App = () => <Box>Later media top wins</Box>;
