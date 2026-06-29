// Lowercase imported runtime condition roots are module-scope bindings, not component props.
// Also covers a calc() branch followed by a literal unit suffix: the suffix must
// not be appended to the calc() branch (which would yield invalid `calc(...)px`).
import styled from "styled-components";
import { Browser as browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${browser.isTouchDevice ? 5 : 1}px;
  height: ${browser.isTouchDevice ? "calc(40px + 8px)" : 40}px;
  background-color: peachpuff;
`;

export const App = () => <Box>Lowercase imported runtime condition</Box>;
