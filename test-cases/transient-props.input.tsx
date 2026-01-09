import styled from "styled-components";

const Comp = styled.div<{ $draggable?: boolean }>`
  color: red;
  cursor: ${(props) => (props.$draggable ? "move" : "pointer")};
`;

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>
    {text}
  </a>
);

const StyledLink = styled(Link)<{ $red?: boolean }>`
  color: ${(props) => (props.$red ? "red" : "blue")};
`;

// Pattern 3: Transient prop with dynamic value passed to inlined component
// The prop is declared in type but not used in styles - must be stripped when inlined
const Point = styled.div<{ $size?: number }>`
  position: absolute;
  width: 12px;
  height: 8px;
  background-color: white;
`;

export const App = () => (
  <div>
    <Comp $draggable>Draggable</Comp>
    <Comp>Not Draggable</Comp>
    <StyledLink text="Click" $red />
    <StyledLink text="Click" />
    <Point $size={100} style={{ top: "10px" }} />
  </div>
);
