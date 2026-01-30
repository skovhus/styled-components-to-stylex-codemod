import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $width: string;
  $height: string;
};

// Direct template literal body with string props (values used directly in CSS)
function Box(props: BoxProps) {
  const { children, $width, $height } = props;
  return (
    <div {...stylex.props(styles.boxWidth($width), styles.boxHeight($height))}>{children}</div>
  );
}

type MixedBoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $padding: string;
};

// Mixed static and dynamic styles
function MixedBox(props: MixedBoxProps) {
  const { children, $padding } = props;
  return <div {...stylex.props(styles.mixedBox, styles.mixedBoxPadding($padding))}>{children}</div>;
}

type MultiPropBoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $margin: string;
  $border: string;
};

// Multiple dynamic properties in a single template literal
function MultiPropBox(props: MultiPropBoxProps) {
  const { children, $margin, $border } = props;
  return (
    <div {...stylex.props(styles.multiPropBoxMargin($margin), styles.multiPropBoxBorder($border))}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box $width="100px" $height="50px" />
    <MixedBox $padding="10px" />
    <MultiPropBox $margin="8px" $border="1px solid red" />
  </div>
);

const styles = stylex.create({
  boxWidth: (width: string) => ({
    width,
  }),
  boxHeight: (height: string) => ({
    height,
  }),

  // Mixed static and dynamic styles
  mixedBox: {
    backgroundColor: "blue",
  },
  mixedBoxPadding: (padding: string) => ({
    padding,
  }),
  multiPropBoxMargin: (margin: string) => ({
    margin,
  }),
  multiPropBoxBorder: (border: string) => ({
    border,
  }),
});
