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
  const { children, $isActive, $size } = props;
  return (
    <div
      {...stylex.props(
        styles.box,
        $isActive && styles.boxActive,
        $size === "large" && styles.boxSizeLarge,
      )}
    >
      {children}
    </div>
  );
}

type ImageProps = Omit<React.ComponentProps<"img">, "className" | "style"> & {
  $isInactive?: boolean;
};

export function Image(props: ImageProps) {
  const { $isInactive, ...rest } = props;
  return <img {...rest} {...stylex.props(styles.image, $isInactive && styles.imageInactive)} />;
}

type SliderProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $height: number;
};

function Slider(props: SliderProps) {
  const { children, $height } = props;
  return <div {...stylex.props(styles.slider, styles.sliderHeight($height))}>{children}</div>;
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
