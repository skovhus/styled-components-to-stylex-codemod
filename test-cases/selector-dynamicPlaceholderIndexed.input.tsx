// Indexed theme lookup inside pseudo-element selectors
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const Input = styled.input<{ $placeholderColor: Color }>`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${(props) => props.theme.color[props.$placeholderColor]};
  }
`;

// Indexed theme lookup in ::after pseudo-element
const Badge = styled.span<{ $indicatorColor: Color }>`
  position: relative;
  padding: 4px 8px;
  background-color: #eee;

  &::after {
    content: "";
    display: block;
    height: 3px;
    background-color: ${(props) => props.theme.color[props.$indicatorColor]};
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <Input $placeholderColor="labelBase" placeholder="Base color" />
    <Input $placeholderColor="labelMuted" placeholder="Muted color" />
    <Badge $indicatorColor="labelBase">Base</Badge>
    <Badge $indicatorColor="labelMuted">Muted</Badge>
  </div>
);
