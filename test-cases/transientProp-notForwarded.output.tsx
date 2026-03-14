import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Pattern: styled(Component) with transient prop used only for styling
// The transient prop should NOT be forwarded to the wrapped component
// because the wrapped component doesn't accept it

interface FlexProps {
  column?: boolean;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A Flex component - does NOT accept $applyBackground */
function Flex(props: FlexProps) {
  const { column, gap, className, style, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: column ? "column" : "row",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ScrollableProps extends React.ComponentPropsWithRef<typeof Flex> {
  /** Whether to apply background color - used only for styling */
  applyBackground?: boolean;
  sx?: stylex.StyleXStyles;
}

/**
 * Scrollable wraps Flex and adds a transient prop for conditional styling.
 * The $applyBackground prop must NOT be passed to Flex since Flex doesn't accept it.
 */
export function Scrollable(props: ScrollableProps) {
  const { className, children, style, sx, applyBackground, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...mergedSx(
        [styles.scrollable, applyBackground ? styles.scrollableApplyBackground : undefined, sx],
        className,
        style,
      )}
    >
      {children}
    </Flex>
  );
}

type BoxProps = {
  isActive?: boolean;
  size?: "small" | "large";
} & React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles };

// DOM elements: transient props must NOT leak to the underlying element
export function Box(props: BoxProps) {
  const { className, children, style, sx, isActive, size, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [styles.box, size === "large" && styles.boxSizeLarge, isActive && styles.boxActive, sx],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

type ImageProps = { isInactive?: boolean } & React.ComponentProps<"img"> & {
    sx?: stylex.StyleXStyles;
  };

export function Image(props: ImageProps) {
  const { className, style, sx, isInactive, ...rest } = props;

  return (
    <img
      {...rest}
      {...mergedSx([styles.image, isInactive && styles.imageInactive, sx], className, style)}
    />
  );
}

// Usage
export const App = () => (
  <div>
    <Scrollable applyBackground column gap={10}>
      <div>Item 1</div>
      <div>Item 2</div>
    </Scrollable>
    <Box isActive size="large">
      Active large box
    </Box>
    <Box size="small">Small inactive box</Box>
    <Image isInactive src="/avatar.png" alt="Avatar" />
  </div>
);

const styles = stylex.create({
  scrollable: {
    overflowY: "auto",
    backgroundColor: "inherit",
  },
  scrollableApplyBackground: {
    backgroundColor: "gray",
  },
  box: {
    padding: "8px",
    backgroundColor: "gray",
    color: "white",
  },
  boxActive: {
    backgroundColor: "blue",
  },
  boxSizeLarge: {
    padding: "16px",
  },
  image: {
    opacity: 1,
    borderRadius: "50%",
  },
  imageInactive: {
    opacity: 0.5,
  },
});
