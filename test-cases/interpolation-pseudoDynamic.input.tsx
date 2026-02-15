import styled from "styled-components";
import { highlight } from "./lib/helpers";

const Button = styled.button<{ $active?: boolean }>`
  color: blue;
  padding: 8px 16px;

  &:${highlight} {
    ${(props) => props.$active && `background-color: red;`}
  }
`;

/**
 * Ternary with CSS in alternate branch: the guard must be negated.
 * `$disabled ? '' : 'background-color: green;'` → `!$disabled && ...`
 */
const InvertedButton = styled.button<{ $disabled?: boolean }>`
  color: blue;
  padding: 8px 16px;

  &:${highlight} {
    ${(props) => (props.$disabled ? "" : "background-color: green;")}
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Button $active>Active</Button>
    <Button>Inactive</Button>
    <InvertedButton>Enabled</InvertedButton>
    <InvertedButton $disabled>Disabled</InvertedButton>
  </div>
);
