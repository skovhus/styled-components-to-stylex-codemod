// Repro: Same pseudo selector or at-rule cannot be used more than once
// Pattern: dynamic borderColor override at default scope (ternary), then borderColor again under :focus
import styled from "styled-components";
import { themedBorder } from "./lib/helpers";

const JsonTextarea = styled.textarea<{ $hasError?: boolean }>`
  border: ${themedBorder("bgBorderFaint")};
  border-color: ${(props) => (props.$hasError ? props.theme.color.greenBase : undefined)};
  border-radius: 6px;

  &:focus {
    outline: none;
    border-color: ${(props) =>
      props.$hasError ? props.theme.color.greenBase : props.theme.color.controlPrimary};
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <JsonTextarea defaultValue="default" />
    <JsonTextarea $hasError defaultValue="error" />
  </div>
);
