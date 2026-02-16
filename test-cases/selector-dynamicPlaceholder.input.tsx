import styled from "styled-components";

const Input = styled.input`
  padding: 12px;
  border: 1px solid #ccc;
  background: white;

  &::placeholder {
    color: ${(props) => props.theme.color.labelMuted};
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <Input placeholder="Muted placeholder" />
    <Input placeholder="Second input" />
  </div>
);
