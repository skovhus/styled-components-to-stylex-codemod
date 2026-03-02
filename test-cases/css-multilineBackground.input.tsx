import styled from "styled-components";

// Multiline gradient formatting should normalize to a compact backgroundImage value
const Card = styled.div`
  background: linear-gradient(to right, transparent, black 80%, hotpink);
  color: white;
  padding: 12px;
`;

export const App = () => (
  <div style={{ padding: 16, background: "#111" }}>
    <Card>Gradient Card</Card>
  </div>
);
