// @expected-warning: Unsupported interpolation: property
// A non-variable local binding shadows the module-scope CSS variable name constant.
import styled from "styled-components";

const ITEM_MIN_WIDTH_VAR = "--module-scope-name";

export function App() {
  function ITEM_MIN_WIDTH_VAR() {
    return "--not-a-static-css-variable";
  }

  const Container = styled.div`
    ${ITEM_MIN_WIDTH_VAR}: 100%;
    background-color: orange;
    color: white;
    padding: 8px;
  `;

  return <Container>Container</Container>;
}
