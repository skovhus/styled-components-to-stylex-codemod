// @expected-warning: Unsupported interpolation: property
// The CSS variable name is imported from another file. The codemod cannot
// statically resolve cross-file string constants, so this must bail rather
// than emit a `__SC_EXPR_N__` key.
import styled from "styled-components";
import { ITEM_MIN_WIDTH_VAR } from "./lib/item-min-width";

const Container = styled.div`
  ${ITEM_MIN_WIDTH_VAR}: 100%;
  background-color: orange;
`;

export const App = () => (
  <div>
    <Container>Container</Container>
  </div>
);
