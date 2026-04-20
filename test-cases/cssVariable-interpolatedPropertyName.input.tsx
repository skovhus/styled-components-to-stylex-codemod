// A styled component that sets a CSS variable whose name is provided via a
// template interpolation (e.g. `${ITEM_MIN_WIDTH_VAR}: 100%;`). The codemod
// resolves the identifier to its top-level static string value.
import styled from "styled-components";

const ITEM_MIN_WIDTH_VAR = "--item-min-width";

const Container = styled.div`
  ${ITEM_MIN_WIDTH_VAR}: 100%;
  background-color: orange;
  color: white;
  padding: 8px;
`;

const Consumer = styled.div`
  width: var(--item-min-width);
  background-color: teal;
  color: white;
  padding: 8px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Container>Sets --item-min-width: 100%</Container>
    <Consumer>Reads var(--item-min-width)</Consumer>
  </div>
);
