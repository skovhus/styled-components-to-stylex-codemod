// Variant condition prop (position) should NOT be forwarded to the wrapped Flex component
import styled from "styled-components";
import { Flex } from "./lib/flex";

const TooltipContainer = styled(Flex)<{ position: "top" | "bottom" }>`
  padding: 8px;
  ${(props) =>
    props.position === "top"
      ? `
    border-bottom: 2px solid black;
  `
      : `
    border-top: 2px solid black;
  `};
`;

export const App = () => (
  <div>
    <TooltipContainer position="top">Above</TooltipContainer>
    <TooltipContainer position="bottom">Below</TooltipContainer>
  </div>
);
