import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type CompProps = React.PropsWithChildren<{
  draggable?: boolean;
}>;

function Comp(props: CompProps) {
  const { children, draggable } = props;

  return <div sx={[styles.comp, draggable && styles.compDraggable]}>{children}</div>;
}

const Link = ({ className, text, ...props }: { className?: string; text: string }) => (
  <a {...props} className={className}>
    {text}
  </a>
);

type StyledLinkProps = { red?: boolean } & Omit<React.ComponentPropsWithRef<typeof Link>, "style">;

function StyledLink(props: StyledLinkProps) {
  const { className, red, ...rest } = props;

  return <Link {...rest} {...mergedSx([styles.link, red && styles.linkRed], className)} />;
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

// The wrapper uses $isOpen for styling; ArrowIcon declares it in props but filters before spreading
export function CollapseArrowIcon(
  props: Omit<React.ComponentPropsWithRef<typeof ArrowIcon>, "className" | "style" | "$isOpen"> & {
    [K in "$isOpen" as "isOpen"]: React.ComponentPropsWithRef<typeof ArrowIcon>[K];
  },
) {
  const { isOpen, ...rest } = props;

  return (
    <ArrowIcon
      $isOpen={isOpen}
      {...rest}
      {...stylex.props(styles.collapseArrowIcon, isOpen ? styles.collapseArrowIconOpen : undefined)}
    />
  );
}

export const App = () => (
  <div>
    <Comp draggable>Draggable</Comp>
    <Comp>Not Draggable</Comp>
    <StyledLink text="Click" red />
    <StyledLink text="Click" />
    <div data-testid="point" sx={styles.point} />
    <CollapseArrowIcon isOpen />
    <CollapseArrowIcon isOpen={false} />
    <StyledAnimatedContainer $direction="up" $delay={0.4} />
    <FaderConsumer>Visible</FaderConsumer>
    <FaderConsumerReversed>Reversed</FaderConsumerReversed>
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

function StyledAnimatedContainer(props: React.ComponentPropsWithRef<typeof AnimatedContainer>) {
  const { className, style, ...rest } = props;

  return <AnimatedContainer {...rest} {...mergedSx(styles.animatedContainer, className, style)} />;
}

type FaderProps = {
  $open: boolean;
  $duration: number;
} & React.ComponentProps<"div">;

// Pattern 6: Transient props with spread at call site — $-prefixed props
// explicitly passed should still be renamed even when spread is present
function Fader(props: FaderProps) {
  const { className, children, style, $duration, $open, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [styles.fader, $open && styles.faderOpen, styles.faderTransition($duration)],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

function FaderConsumer(props: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { children, ...rest } = props;
  return (
    <Fader {...rest} $open={!!children} $duration={350}>
      {children}
    </Fader>
  );
}

// Pattern 7: $open appears BEFORE spread — spread may override it at runtime,
// so it must NOT be renamed (renaming would break the override relationship).
function FaderConsumerReversed(props: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { children, ...rest } = props;
  return (
    <Fader $open={!!children} $duration={350} {...rest}>
      {children}
    </Fader>
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
    width: 12,
    height: 8,
    backgroundColor: "white",
    top: "10px",
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
  fader: {
    opacity: 0,
    pointerEvents: "none",
  },
  faderOpen: {
    opacity: 1,
    pointerEvents: "inherit",
  },
  faderTransition: (transition: number) => ({
    transition: `opacity ${transition}ms`,
  }),
});
