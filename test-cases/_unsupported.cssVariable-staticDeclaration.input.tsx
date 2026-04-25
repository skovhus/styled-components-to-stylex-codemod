// @expected-warning: CSS custom property declarations are not supported in StyleX
import styled from "styled-components";

const Container = styled.div`
  --item-min-width: 100%;
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
