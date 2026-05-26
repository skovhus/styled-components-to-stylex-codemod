// @expected-warning: Unsupported interpolation: property
// A switch-case lexical binding shadows an outer block CSS variable name constant.
import styled from "styled-components";

export function App() {
  const ITEM_MIN_WIDTH_VAR = "--outer-switch-name";

  switch ("use") {
    case "declare":
      const ITEM_MIN_WIDTH_VAR = "--case-name";
      return <div>{ITEM_MIN_WIDTH_VAR}</div>;
    case "use": {
      const Container = styled.div`
        ${ITEM_MIN_WIDTH_VAR}: 100%;
        background-color: orange;
        color: white;
        padding: 8px;
      `;

      return <Container>Container</Container>;
    }
    default:
      return null;
  }
}
