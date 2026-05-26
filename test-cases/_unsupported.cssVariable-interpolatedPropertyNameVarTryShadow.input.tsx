// @expected-warning: Unsupported interpolation: property
// A function-local var binding inside a try block shadows an outer block CSS variable name constant.
import styled from "styled-components";

export function App() {
  const ITEM_MIN_WIDTH_VAR = "--outer-var-try-name";

  function renderContainer() {
    try {
      var ITEM_MIN_WIDTH_VAR = "--runtime-var-try-name";
    } catch {
      // no-op
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
