import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// Destructured default should preserve `undefined` semantics:
// omitted $oneLine uses the default true branch.
const TitleText = styled.div<{ $oneLine?: boolean }>`
  line-height: 1rem;
  ${({ $oneLine = true }) => truncateMultiline($oneLine ? 1 : 2)};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText>Default (should use 1-line)</TitleText>
    <TitleText $oneLine={false}>Two-line truncated</TitleText>
  </div>
);
