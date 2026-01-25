import styled from "styled-components";

const Button = styled.button<{ $primary?: boolean; hollow?: boolean }>`
  color: ${(props) => (props.$primary ? "white" : "#BF4F74")};
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border-radius: 3px;
  ${(props) =>
    props.hollow
      ? `border: 2px solid #bf4f74`
      : `background: ${props.$primary ? "#BF4F74" : "white"}`};
`;

// Test case: inner ternary tests the same prop as outer
// The inner variants must be guarded by the outer falsy condition
// to prevent the "medium" background from leaking into size === "small"
const Badge = styled.span<{ size?: "small" | "medium" | "large" }>`
  display: inline-block;
  ${(props) =>
    props.size === "small"
      ? `font-size: 10px`
      : `background: ${props.size === "large" ? "blue" : "gray"}`};
`;

export const App = () => (
  <div>
    <Button>Normal</Button>
    <Button $primary>Primary</Button>
    <br />
    <Button hollow>Hollow</Button>
    <Button hollow $primary>
      Primary Hollow
    </Button>
    <br />
    <Badge size="small">Small</Badge>
    <Badge size="medium">Medium</Badge>
    <Badge size="large">Large</Badge>
  </div>
);
