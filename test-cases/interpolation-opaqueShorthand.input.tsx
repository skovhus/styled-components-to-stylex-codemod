// Directional expansion for opaque shorthand theme tokens
import styled from "styled-components";

const Input = styled.input`
  padding: ${(props) => props.theme.inputPadding};
  padding-left: 0;
  background-color: white;
  border: 1px solid #ccc;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Input placeholder="With directional padding" />
  </div>
);
