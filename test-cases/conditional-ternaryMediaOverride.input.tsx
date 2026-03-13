// Ternary choosing between resolved values with a media query override for same prop
import styled from "styled-components";
import { fontSize, screenSize } from "./lib/helpers";

const Title = styled.div<{ $size?: "small" | "large" }>`
  font-size: ${(props) => (props.$size === "large" ? fontSize("large") : fontSize("small"))};
  ${screenSize.phone} {
    font-size: ${(props) => (props.$size === "large" ? fontSize("medium") : fontSize("small"))};
  }
  font-weight: 500;
  color: #333;
`;

const Card = styled.label<{ checked: boolean; disabled?: boolean }>`
  display: flex;
  padding: 16px;
  border-width: 1px;
  border-style: solid;
  border-color: ${(props) => (props.checked ? "#0066cc" : "#ccc")};
  border-radius: 6px;
  cursor: ${(props) => (props.disabled ? "not-allowed" : "pointer")};

  &:hover {
    border-color: ${(props) => (props.disabled ? "#ddd" : props.checked ? "#0044aa" : "#999")};
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <Title>Default Title</Title>
      <Title $size="large">Large Title</Title>
      <Title $size="small">Small Title</Title>
      <Card checked={false}>
        <span>Unchecked</span>
      </Card>
      <Card checked>
        <span>Checked</span>
      </Card>
      <Card checked disabled>
        <span>Checked Disabled</span>
      </Card>
      <Card checked={false} disabled>
        <span>Unchecked Disabled</span>
      </Card>
    </div>
  );
}
