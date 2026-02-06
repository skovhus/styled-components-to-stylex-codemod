import styled from "styled-components";

// Props defined via interface (not TSTypeLiteral)
interface TransientButtonProps {
  $variant?: "primary" | "secondary";
  $size?: "small" | "large";
}

// Exported component with shouldForwardProp using dropPrefix pattern
// Props are defined via interface reference, not inline type literal
// The cleanup loop should still filter unknown $-prefixed props
export const TransientButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !prop.startsWith("$"),
})<TransientButtonProps>`
  background: ${(props) => (props.$variant === "primary" ? "#BF4F74" : "#4F74BF")};
  padding: ${(props) => (props.$size === "large" ? "12px 24px" : "8px 16px")};
  color: white;
`;

export const App = () => (
  <div>
    <TransientButton $variant="primary" $size="large">
      Primary Large
    </TransientButton>
  </div>
);
