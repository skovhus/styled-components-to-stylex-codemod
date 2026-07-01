// Tests extraClassNames: adapter returns className expressions from CSS modules
import styled from "styled-components";
import { draggableRegion } from "./lib/helpers";

const DraggableBar = styled.div`
  pointer-events: all;
  ${draggableRegion()};

  &:hover {
    color: white;
  }
`;

export function App() {
  return <DraggableBar>Draggable</DraggableBar>;
}
