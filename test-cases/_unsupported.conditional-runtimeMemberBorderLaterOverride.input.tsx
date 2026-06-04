// @expected-warning: Unsupported interpolation: call expression
// A later border longhand declaration must not be overridden by an earlier runtime border branch.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  border: ${Browser.isTouchDevice ? 1 : 2}px solid red;
  border-top-width: 0;
  background-color: peachpuff;
`;

export const App = () => <Box>Later border-top-width wins</Box>;
