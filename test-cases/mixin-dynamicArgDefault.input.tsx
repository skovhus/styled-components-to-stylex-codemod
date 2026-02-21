import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// Destructured default should preserve `undefined` semantics:
// omitted $oneLine uses the default true branch.
const TitleText = styled.div<{ $oneLine?: boolean }>`
  line-height: 1rem;
  ${({ $oneLine = true }) => truncateMultiline($oneLine ? 1 : 2)};
`;

// When the same prop also drives another interpolation, wrapper-level defaulting
// must not be hoisted globally (it would change the second interpolation semantics).
const ColorTitleText = styled.div<{ $oneLine?: boolean }>`
  line-height: 1rem;
  ${({ $oneLine = true }) => truncateMultiline($oneLine ? 1 : 2)};
  color: ${({ $oneLine }) => ($oneLine === undefined ? "purple" : "teal")};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText>Default one-line (safe to hoist default)</TitleText>
    <TitleText $oneLine={false}>Two-line truncated</TitleText>
    <ColorTitleText>Default one-line and purple</ColorTitleText>
    <ColorTitleText $oneLine={false}>Two-line and teal</ColorTitleText>
  </div>
);
