import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// Default should only be hoisted when the prop is used exclusively by the
// merged helper-call conditional. Here, another interpolation depends on the
// same prop in a separate style condition, so wrapper-level defaulting would change
// semantics and must not be applied.
const TitleText = styled.div<{ $oneLine?: boolean }>`
  line-height: 1rem;
  ${({ $oneLine = true }) => truncateMultiline($oneLine ? 1 : 2)};
  color: ${({ $oneLine }) => ($oneLine === undefined ? "purple" : "teal")};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText>Default one-line and purple</TitleText>
    <TitleText $oneLine={false}>Two-line and teal</TitleText>
  </div>
);
