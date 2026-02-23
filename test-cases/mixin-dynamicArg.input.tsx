import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

const TitleText = styled.div<{ $oneLine: boolean }>`
  line-height: 1rem;
  ${({ $oneLine }) => truncateMultiline($oneLine ? 1 : 2)};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText $oneLine>One line truncated</TitleText>
    <TitleText $oneLine={false}>
      Two line truncated text that should wrap to a second line before being cut off
    </TitleText>
  </div>
);
