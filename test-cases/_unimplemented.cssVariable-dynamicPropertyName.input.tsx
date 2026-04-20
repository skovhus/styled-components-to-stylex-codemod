// @expected-warning: Unsupported interpolation: property
import styled from "styled-components";

const ITEM_MIN_WIDTH_VAR = "--item-min-width";

// A styled component that sets a CSS custom property whose name comes from
// an interpolated expression. The codemod cannot statically resolve this
// pattern today and bails out instead of emitting an entry whose key is the
// raw `__SC_EXPR_N__` placeholder.
const Container = styled.div`
  ${ITEM_MIN_WIDTH_VAR}: 100%;
  background-color: orange;
`;

export const App = () => (
  <div>
    <Container>Container</Container>
  </div>
);
