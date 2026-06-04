// @expected-warning: Unsupported interpolation: call expression
// A later property-less helper may override properties from an earlier runtime branch.
import styled from "styled-components";
import { Browser, flexCenter } from "./lib/helpers";

const Box = styled.div`
  display: ${Browser.isTouchDevice ? "block" : "inline"};
  ${flexCenter()}
  background-color: peachpuff;
`;

export const App = () => <Box>Later helper wins</Box>;
