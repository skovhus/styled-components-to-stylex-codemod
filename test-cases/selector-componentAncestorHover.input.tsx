// Ancestor hover component selectors must be applied to the target child element.
import styled from "styled-components";

const HoverAction = styled.button`
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.2s,
    transform 0.2s;
`;

const HoverCard = styled.div`
  padding: 16px;
  background: #f1f5f9;
  color: #334155;

  &:hover ${HoverAction} {
    opacity: 1;
    transform: translateY(0);
  }
`;

export const App = () => (
  <HoverCard>
    <span>Hover card</span>
    <HoverAction>Action</HoverAction>
  </HoverCard>
);
