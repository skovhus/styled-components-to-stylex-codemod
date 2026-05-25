// @expected-warning: Unsupported interpolation: property
// A function parameter shadows an outer block CSS variable name constant.
import styled from "styled-components";

export function App() {
  const ITEM_MIN_WIDTH_VAR = "--outer-block-name";

  function renderContainer(ITEM_MIN_WIDTH_VAR: string) {
    const Container = styled.div`
      ${ITEM_MIN_WIDTH_VAR}: 100%;
      background-color: orange;
      color: white;
      padding: 8px;
    `;

    return <Container>Container</Container>;
  }

  return renderContainer("--runtime-name");
}
