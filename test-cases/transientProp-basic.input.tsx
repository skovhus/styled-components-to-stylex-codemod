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

// Pattern 4: styled(Component) where base component declares the transient prop
// The transient prop is used for styling by the wrapper
// CollapseArrowIcon pattern - ArrowIcon declares $isOpen in props, wrapper uses it for styling
import * as React from "react";
import { Icon, type IconProps } from "./lib/icon";

/** Props for the ArrowIcon component. */
interface ArrowIconProps {
  /** Whether the arrow represents an open state */
  $isOpen: boolean;
}

function ArrowIcon(props: IconProps & ArrowIconProps) {
  const { $isOpen, ...rest } = props;
  return (
    <Icon {...rest}>
      <svg viewBox="0 0 16 16">
        <path d="M7 10.6L10.8 7.6L7 5.4V10.6Z" />
      </svg>
    </Icon>
  );
}

// The wrapper uses $isOpen for styling; ArrowIcon declares it in props but filters before spreading
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
    <Point $size={100} style={{ top: "10px" }} data-testid="point" />
    <CollapseArrowIcon $isOpen />
    <CollapseArrowIcon $isOpen={false} />
    <StyledAnimatedContainer $direction="up" $delay={0.4} />
  </div>
);

interface AnimatedContainerProps {
  className?: string;
  style?: React.CSSProperties;
  $direction?: string;
  $delay?: number;
}

function AnimatedContainer(props: AnimatedContainerProps) {
  const { className, style, $direction, $delay } = props;
  return (
    <div className={className} data-direction={$direction} data-delay={$delay} style={style} />
  );
}

const StyledAnimatedContainer = styled(AnimatedContainer)`
  max-width: 90vw;
`;
