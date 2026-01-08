import * as stylex from "@stylexjs/stylex";
import React from "react";

// Bug 5: Transient props ($-prefixed) should NOT be passed to DOM elements.
// styled-components automatically filters these out, but the generated
// StyleX wrapper must also filter them.

// When these are exported, they become wrapper functions that must:
// 1. Accept the transient props for styling decisions
// 2. NOT forward them to the underlying DOM element

const styles = stylex.create({
  box: {
    padding: "8px",
    backgroundColor: "gray",
    color: "white",
  },
  boxSizeLarge: {
    padding: "16px",
  },
  boxActive: {
    backgroundColor: "blue",
  },
  image: {
    opacity: 1,
    borderRadius: "50%",
  },
  imageInactive: {
    opacity: 0.5,
  },
});

type BoxProps = React.ComponentProps<"div"> & {
  $isActive?: boolean;
  $size?: "small" | "large";
};

// styled-components automatically filters these out, but the generated
// StyleX wrapper must also filter them.

// When these are exported, they become wrapper functions that must:
// 1. Accept the transient props for styling decisions
// 2. NOT forward them to the underlying DOM element

export function Box(props: BoxProps) {
  const { children, style, $size, $isActive, ...rest } = props;
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.box,
        $size === "large" && styles.boxSizeLarge,
        $isActive && styles.boxActive,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

type ImageProps = React.ComponentProps<"img"> & {
  $isInactive?: boolean;
};

export function Image(props: ImageProps) {
  const { style, $isInactive, ...rest } = props;
  return (
    <img
      {...rest}
      {...stylex.props(styles.image, $isInactive && styles.imageInactive)}
      style={style}
    />
  );
}

export function App() {
  return (
    <div>
      <Box $isActive $size="large">
        Active large box
      </Box>
      <Box $size="small">Small inactive box</Box>
      <Image $isInactive src="/avatar.png" alt="Avatar" />
    </div>
  );
}
