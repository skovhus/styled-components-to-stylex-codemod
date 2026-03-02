// Two components sharing the same .attrs() pattern — one wrapping a component, one wrapping a div
import styled from "styled-components";
import { Flex } from "./lib/flex";

type Props = {
  $applyBackground?: boolean;
  gutter?: string;
};

export const ScrollableFlex = styled(Flex).attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<Props>`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${(props) => (props.$applyBackground ? props.theme.color.bgBase : "inherit")};
  scrollbar-gutter: ${(props) => props.gutter || "auto"};
  &:focus-visible {
    outline: none;
  }
`;

export const ScrollableDiv = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<Props>`
  overflow-y: auto;
  position: relative;
  background-color: ${(props) => (props.$applyBackground ? props.theme.color.bgBase : "inherit")};
  scrollbar-gutter: ${(props) => props.gutter || "auto"};
  &:focus-visible {
    outline: none;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", height: "200px" }}>
    <ScrollableFlex gutter="stable" $applyBackground>
      <div style={{ height: "400px", padding: "8px" }}>
        Flex: Tab me! (scrollable with stable gutter)
      </div>
    </ScrollableFlex>
    <ScrollableDiv gutter="stable">
      <div style={{ height: "400px", padding: "8px" }}>
        Div: Tab me! (scrollable with stable gutter)
      </div>
    </ScrollableDiv>
  </div>
);
