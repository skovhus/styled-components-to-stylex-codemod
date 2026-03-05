import React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = {
  isActive?: boolean;
  size?: "small" | "large";
} & Omit<React.ComponentProps<"div">, "className" | "style">;

// Pattern 1: Exported components - become wrapper functions that must:
// 1. Accept the transient props for styling decisions
// 2. NOT forward them to the underlying DOM element

export function Box(props: BoxProps) {
  const { children, isActive, size, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[
        styles.box,
        size === "large" && styles.boxSizeLarge,
        isActive ? styles.boxActive : undefined,
      ]}
    >
      {children}
    </div>
  );
}

type ImageProps = { isInactive?: boolean } & Omit<
  React.ComponentProps<"img">,
  "className" | "style"
>;

export function Image(props: ImageProps) {
  const { isInactive, ...rest } = props;

  return <img {...rest} sx={[styles.image, isInactive ? styles.imageInactive : undefined]} />;
}

type SliderProps = React.PropsWithChildren<{
  $height: number;
}>;

function Slider(props: SliderProps) {
  const { children, $height } = props;

  return <div sx={[styles.slider, styles.sliderHeight($height)]}>{children}</div>;
}

export function App() {
  const pickerHeight = 200;
  return (
    <div>
      <Box isActive size="large">
        Active large box
      </Box>
      <Box size="small">Small inactive box</Box>
      <Image isInactive src="/avatar.png" alt="Avatar" />
      {/* Internal components with transient props */}
      <div sx={styles.point} />
      <Slider $height={pickerHeight}>Slider content</Slider>
    </div>
  );
}

const styles = stylex.create({
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
