// @expected-warning: Unsupported interpolation: call expression
// An earlier !important runtime branch wins over a later non-important declaration
// for the same property, so the later declaration cannot subtract the branch — the
// codemod must bail rather than let the non-important value clobber the base.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  top: ${Browser.isTouchDevice ? 5 : 1}px !important;
  top: 2px;
  position: relative;
  background-color: peachpuff;
`;

export const App = () => <Box>Important runtime branch wins</Box>;
