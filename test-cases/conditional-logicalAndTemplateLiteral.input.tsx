import styled from "styled-components";

// Test logical AND with static template literal
const Title = styled.h1<{ $upsideDown?: boolean }>`
  ${(props) => props.$upsideDown && `transform: rotate(180deg);`}
  text-align: center;
  color: #bf4f74;
`;

// Test logical AND with template literal containing theme expression
export const DropZone = styled.div<{ $isDraggingOver: boolean }>`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${(props) =>
    props.$isDraggingOver &&
    `box-shadow: inset 0 0 0 1px ${props.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`;

// Test logical AND with template literal containing multiple theme expressions
export const Card = styled.div<{ $isHighlighted: boolean }>`
  padding: 16px;
  ${(props) =>
    props.$isHighlighted &&
    `border: 1px solid ${props.theme.color.primaryColor}; box-shadow: 0 0 8px ${props.theme.color.bgSub};`}
`;

// Test ternary with template literal containing theme expression and undefined alternate
// This is semantically equivalent to the logical AND form above
export const StatusBar = styled.div<{ $isDisconnected?: boolean }>`
  padding: 8px;
  ${(props) =>
    props.$isDisconnected ? `background-color: ${props.theme.color.bgSub};` : undefined}
`;

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title $upsideDown>Upside Down Title</Title>
    <DropZone $isDraggingOver>Dragging</DropZone>
    <DropZone $isDraggingOver={false}>Not dragging</DropZone>
    <Card $isHighlighted>Highlighted</Card>
    <Card $isHighlighted={false}>Normal</Card>
    <StatusBar $isDisconnected>Disconnected</StatusBar>
    <StatusBar>Connected</StatusBar>
  </div>
);
