// @expected-warning: Unsupported interpolation: property
// A catch parameter shadows an outer block CSS variable name constant.
import styled from "styled-components";

export function App() {
  const ITEM_MIN_WIDTH_VAR = "--outer-block-name";

  try {
    throw new Error("runtime");
  } catch (ITEM_MIN_WIDTH_VAR) {
    const Container = styled.div`
      ${ITEM_MIN_WIDTH_VAR}: 100%;
      background-color: orange;
      color: white;
      padding: 8px;
    `;

    return <Container>Container</Container>;
  }
}
