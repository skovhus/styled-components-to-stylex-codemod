import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  $width: string;
  $height: string;
}>;

// Direct template literal body with string props (values used directly in CSS)
function Box(props: BoxProps) {
  const { children, $width, $height } = props;
  return (
    <div {...stylex.props(styles.boxWidth($width), styles.boxHeight($height))}>{children}</div>
  );
}

type MixedBoxProps = React.PropsWithChildren<{
  $padding: string;
}>;

// Mixed static and dynamic styles
function MixedBox(props: MixedBoxProps) {
  const { children, $padding } = props;

  const sx = stylex.props(styles.mixedBox);
  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        padding: $padding,
      }}
    >
      {children}
    </div>
  );
}

type MultiPropBoxProps = React.PropsWithChildren<{
  $margin: string;
  $border: string;
  $padding: string;
  $background: string;
  $scrollMargin: string;
}>;

// Multiple dynamic properties in a single template literal
// Note: dynamic shorthand values should be preserved via inline styles.
function MultiPropBox(props: MultiPropBoxProps) {
  const { children, $margin, $border, $padding, $background, $scrollMargin } = props;
  return (
    <div
      style={{
        margin: $margin,
        border: $border,
        padding: $padding,
        background: $background,
        scrollMargin: $scrollMargin,
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box $width="100px" $height="50px" />
    <MixedBox $padding="10px" />
    <MultiPropBox
      $margin="8px"
      $border="1px solid red"
      $padding="4px 8px"
      $background="rebeccapurple"
      $scrollMargin="12px"
    />
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
});
