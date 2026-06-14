// Lowercase imported runtime condition roots are module-scope bindings, not component props.
import styled from "styled-components";
import { Browser as browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${browser.isTouchDevice ? 5 : 1}px;
  background-color: peachpuff;
`;

export const App = () => <Box>Lowercase imported runtime condition</Box>;
