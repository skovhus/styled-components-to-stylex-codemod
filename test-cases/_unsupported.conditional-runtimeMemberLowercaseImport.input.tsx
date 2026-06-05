// @expected-warning: Adapter resolveValue returned undefined for imported value
// Lowercase imported runtime condition roots can be misread as component props by wrapper emission.
import styled from "styled-components";
import { Browser as browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${browser.isTouchDevice ? 5 : 1}px;
  background-color: peachpuff;
`;

export const App = () => <Box>Lowercase imported runtime condition</Box>;
