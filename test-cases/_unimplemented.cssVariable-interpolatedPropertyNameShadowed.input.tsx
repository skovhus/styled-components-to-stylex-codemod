// @expected-warning: Unsupported interpolation: property
// A local `const ITEM_MIN_WIDTH_VAR` inside the wrapping function shadows the
// module-scope binding. The codemod must bail rather than blindly substituting
// the module-scope string value, which could be a different CSS variable name.
import styled from "styled-components";

const ITEM_MIN_WIDTH_VAR = "--module-scope-name";

export function App() {
  // Shadowing local: in real code this could be a different value entirely.
  const ITEM_MIN_WIDTH_VAR = "--locally-shadowed-name";

  const Container = styled.div`
    ${ITEM_MIN_WIDTH_VAR}: 100%;
    background-color: orange;
  `;

  return <Container>Container</Container>;
}
