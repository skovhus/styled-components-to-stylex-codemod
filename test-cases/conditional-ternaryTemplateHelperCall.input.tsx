import styled from "styled-components";
import { color } from "./lib/helpers";

const StepLine = styled.div<{ $faded: boolean }>`
  flex: 1;
  width: 100px;
  height: 100px;
  background: ${(props) =>
    props.$faded
      ? `linear-gradient(to bottom, ${color("bgSub")(props)} 70%, rgba(0, 0, 0, 0) 100%)`
      : `linear-gradient(to bottom, ${color("bgSub")(props)} 70%, ${color("bgSub")(props)} 100%)`};
`;

export const App = () => <StepLine $faded />;
