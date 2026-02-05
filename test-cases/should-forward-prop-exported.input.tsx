import styled from "styled-components";

// Exported component with shouldForwardProp using dropPrefix pattern
// The cleanup loop should filter unknown $-prefixed props from rest
// so external callers can't accidentally forward $unknown to the DOM
export const TransientButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !prop.startsWith("$"),
})<{ $variant?: "primary" | "secondary" }>`
  background: ${(props) => (props.$variant === "primary" ? "#BF4F74" : "#4F74BF")};
  color: white;
  padding: 8px 16px;
`;

// Exported component with explicit list-based shouldForwardProp
export const ExplicitFilterButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !["customProp", "anotherProp"].includes(prop),
})<{ customProp?: string; anotherProp?: number }>`
  background: ${(props) => props.customProp || "#BF4F74"};
  padding: ${(props) => (props.anotherProp || 16) + "px"};
  color: white;
`;

export const App = () => (
  <div>
    <TransientButton $variant="primary">Primary</TransientButton>
    <ExplicitFilterButton customProp="#4CAF50" anotherProp={24}>
      Custom
    </ExplicitFilterButton>
  </div>
);
