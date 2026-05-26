// @expected-warning: Unsupported interpolation: property
// A function-local var binding in a loop header shadows an outer block CSS variable name constant.
import styled from "styled-components";

export function App() {
  const ITEM_MIN_WIDTH_VAR = "--outer-var-loop-name";

  function renderContainer() {
    for (var ITEM_MIN_WIDTH_VAR of ["--runtime-var-loop-name"]) {
      break;
    }

    const Container = styled.div`
      ${ITEM_MIN_WIDTH_VAR}: 100%;
      background-color: orange;
      color: white;
      padding: 8px;
    `;

    return <Container>Container</Container>;
  }

  return renderContainer();
}
