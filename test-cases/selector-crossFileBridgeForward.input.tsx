import styled from "styled-components";
import { CollapseArrowIcon, CollapseArrowIconGlobalSelector } from "./lib/converted-collapse-icon";

export const StyledCollapseButton = styled.div`
  padding: 12px;
  background-color: #f0f0f0;
  cursor: pointer;

  &:hover ${CollapseArrowIconGlobalSelector} {
    background-color: rebeccapurple;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <StyledCollapseButton>
        <CollapseArrowIcon />
        <span>Hover me</span>
      </StyledCollapseButton>
    </div>
  );
}
