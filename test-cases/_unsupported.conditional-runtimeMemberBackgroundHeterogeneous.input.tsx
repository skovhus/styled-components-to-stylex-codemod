// @expected-warning: Unsupported interpolation: call expression
// Heterogeneous background branches need shorthand reset semantics that cannot be emitted directly.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  background: ${Browser.isTouchDevice ? "url(foo.png)" : "red"};
`;

export const App = () => <Box>Heterogeneous background</Box>;
