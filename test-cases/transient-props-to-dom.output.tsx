import React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  $isActive?: boolean;
  $size?: "small" | "large";
}>;

// Pattern 1: Exported components - become wrapper functions that must:
// 1. Accept the transient props for styling decisions
// 2. NOT forward them to the underlying DOM element

export function Box(props: BoxProps) {
  const { children, $size, $isActive } = props;
  return (
    <div
      {...stylex.props(
        styles.box,
        $size === "large" && styles.boxSizeLarge,
        $isActive && styles.boxActive,
      )}
    >
      {children}
    </div>
  );
}

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "className" | "style"> & {
  $isInactive?: boolean;
};

export function Image(props: ImageProps) {
  const { $isInactive, ...rest } = props;
  return <img {...rest} {...stylex.props(styles.image, $isInactive && styles.imageInactive)} />;
}

export function App() {
  const pickerHeight = 200;
  return (
    <div>
      <Box $isActive $size="large">
        Active large box
      </Box>
      <Box $size="small">Small inactive box</Box>
      <Image $isInactive src="/avatar.png" alt="Avatar" />
      {/* Internal components with transient props */}
      <div {...stylex.props(styles.point)} />
      <div {...stylex.props(styles.slider, styles.sliderHeight(pickerHeight))}>Slider content</div>
    </div>
  );
}

// Bug 5: Transient props ($-prefixed) should NOT be passed to DOM elements.
// styled-components automatically filters these out, but the generated
// StyleX wrapper must also filter them.

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

  // Pattern 2: Non-exported internal components with transient props
  // These are used inline but still must NOT pass $-prefixed props to DOM
  // (from ColorPicker.tsx - Point component with $pickerHeight)
  point: {
    position: "absolute",
    left: "-3px",
    width: "12px",
    height: "4px",
  },
  slider: {
    position: "relative",
  },
  sliderHeight: (height: number) => ({
    height: `${height}px`,
  }),
});
