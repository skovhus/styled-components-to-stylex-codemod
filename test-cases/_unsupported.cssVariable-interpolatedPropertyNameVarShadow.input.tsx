// @expected-warning: Unsupported interpolation: property
// A function-local var binding shadows an outer block CSS variable name constant.
import styled from "styled-components";

export function App() {
  const ITEM_MIN_WIDTH_VAR = "--outer-var-name";

  function renderContainer() {
    var ITEM_MIN_WIDTH_VAR = "--runtime-var-name";

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
