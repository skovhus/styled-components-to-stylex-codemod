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

// Pattern 4: styled(Component) where base component REQUIRES the transient prop
// The transient prop is used for styling AND needed by the base component
// CollapseArrowIcon pattern - ArrowIcon needs $isOpen, and styled uses it too
import * as React from "react";
import { Icon, type IconProps } from "./lib/icon";

/** Props for the ArrowIcon component. */
interface ArrowIconProps {
  /** Whether the arrow represents an open state */
  $isOpen: boolean;
}

function ArrowIcon(props: IconProps & ArrowIconProps) {
  return (
    <Icon {...props}>
      <svg viewBox="0 0 16 16">
        <path d="M7 10.6L10.8 7.6L7 5.4V10.6Z" />
      </svg>
    </Icon>
  );
}

// The wrapper uses $isOpen for styling, but ArrowIcon also NEEDS $isOpen
export const CollapseArrowIcon = styled(ArrowIcon)`
  transform: rotate(${(props) => (props.$isOpen ? "90deg" : "0deg")});
  transition: transform 0.2s;
`;

export const App = () => (
  <div>
    <Comp $draggable>Draggable</Comp>
    <Comp>Not Draggable</Comp>
    <StyledLink text="Click" $red />
    <StyledLink text="Click" />
    <Point $size={100} style={{ top: "10px" }} />
    <CollapseArrowIcon $isOpen />
    <CollapseArrowIcon $isOpen={false} />
  </div>
);
