import * as React from "react";
import styled from "styled-components";

// Support ternary interpolations where branches are template literals with theme access.
// The adapter should resolve the theme color.

export const DropZone = styled.div<{ $isDraggingOver: boolean }>`
  padding: 16px;
  border-radius: 8px;
  box-shadow: ${(props) =>
    props.$isDraggingOver
      ? `inset 0 0 0 1px ${props.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06)`
      : `0px 1px 2px rgba(0, 0, 0, 0.06)`};
`;

export const App = () => (
  <div>
    <DropZone $isDraggingOver>Dragging</DropZone>
    <DropZone $isDraggingOver={false}>Not dragging</DropZone>
  </div>
);
