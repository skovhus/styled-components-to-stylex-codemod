import styled from 'styled-components';

const Comp = styled.div<{ $draggable?: boolean }>`
  color: red;
  cursor: ${props => (props.$draggable ? 'move' : 'pointer')};
`;

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>{text}</a>
);

const StyledLink = styled(Link)<{ $red?: boolean }>`
  color: ${props => (props.$red ? 'red' : 'blue')};
`;

export const App = () => (
  <div>
    <Comp $draggable>Draggable</Comp>
    <Comp>Not Draggable</Comp>
    <StyledLink text="Click" $red />
    <StyledLink text="Click" />
  </div>
);