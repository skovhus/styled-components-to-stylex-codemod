// @expected-warning: Arrow function: theme access path could not be resolved
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const Input = styled.input<{ $placeholderColor: Color }>`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${(props) => props.theme.color[props.$placeholderColor]};
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <Input $placeholderColor="labelBase" placeholder="Base color" />
    <Input $placeholderColor="labelMuted" placeholder="Muted color" />
  </div>
);
