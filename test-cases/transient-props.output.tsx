import * as stylex from "@stylexjs/stylex";

type CompProps = React.PropsWithChildren<{
  $draggable?: boolean;
}>;

function Comp(props: CompProps) {
  const { children, $draggable } = props;
  return <div {...stylex.props(styles.comp, $draggable && styles.compDraggable)}>{children}</div>;
}

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>
    {text}
  </a>
);

type StyledLinkProps = Omit<React.ComponentPropsWithRef<typeof Link>, "style" | "className"> & {
  $red?: boolean;
};

function StyledLink(props: StyledLinkProps) {
  const { $red, ...rest } = props;
  return <Link {...rest} {...stylex.props(styles.link, $red && styles.linkRed)} />;
}

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

type CollapseArrowIconProps = Omit<
  React.ComponentPropsWithRef<typeof ArrowIcon>,
  "style" | "className"
>;

// The wrapper uses $isOpen for styling; ArrowIcon declares it in props but filters before spreading
export function CollapseArrowIcon(props: CollapseArrowIconProps) {
  const { $isOpen, ...rest } = props;
  return (
    <ArrowIcon
      $isOpen={$isOpen}
      {...rest}
      {...stylex.props(styles.collapseArrowIcon, $isOpen && styles.collapseArrowIconOpen)}
    />
  );
}

export const App = () => (
  <div>
    <Comp $draggable>Draggable</Comp>
    <Comp>Not Draggable</Comp>
    <StyledLink text="Click" $red />
    <StyledLink text="Click" />
    <div {...stylex.props(styles.point)} />
    <CollapseArrowIcon $isOpen />
    <CollapseArrowIcon $isOpen={false} />
    <AnimatedContainer $direction="up" $delay={0.4} {...stylex.props(styles.animatedContainer)} />
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

const styles = stylex.create({
  comp: {
    color: "red",
    cursor: "pointer",
  },
  compDraggable: {
    cursor: "move",
  },
  link: {
    color: "blue",
  },
  linkRed: {
    color: "red",
  },

  // Pattern 3: Transient prop with dynamic value passed to inlined component
  // The prop is declared in type but not used in styles - must be stripped when inlined
  point: {
    position: "absolute",
    width: "12px",
    height: "8px",
    backgroundColor: "white",
  },
  collapseArrowIcon: {
    transform: "rotate(0deg)",
    transition: "transform 0.2s",
  },
  collapseArrowIconOpen: {
    transform: "rotate(90deg)",
  },
  animatedContainer: {
    maxWidth: "90vw",
  },
});
