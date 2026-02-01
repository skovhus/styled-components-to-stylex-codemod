import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type MixedBackgroundProps = React.PropsWithChildren<{
  $useGradient: boolean;
}>;

// This pattern mixes gradients (which need backgroundImage) and colors
// (which need backgroundColor) in the same conditional. Each variant
// is emitted with its appropriate StyleX property.
function MixedBackground(props: MixedBackgroundProps) {
  const { children, $useGradient } = props;
  return (
    <div
      {...stylex.props(
        !$useGradient && styles.mixedBackgroundNotUseGradient,
        $useGradient && styles.mixedBackgroundUseGradient,
      )}
    >
      {children}
    </div>
  );
}

type NestedColorBackgroundProps = React.PropsWithChildren<{
  $color: "red" | "blue" | "default";
}>;

// Nested ternary with all colors (homogeneous) but using || in the default condition
// Tests that "!(A || B)" condition parsing produces valid identifier suffixes
function NestedColorBackground(props: NestedColorBackgroundProps) {
  const { children, $color } = props;
  return (
    <div
      {...stylex.props(
        styles.nestedColorBackground,
        $colorVariants[$color as keyof typeof $colorVariants] ?? $colorVariants.default,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <MixedBackground $useGradient={false}>Solid Color</MixedBackground>
    <MixedBackground $useGradient={true}>Gradient</MixedBackground>
    <NestedColorBackground $color="red">Red</NestedColorBackground>
    <NestedColorBackground $color="blue">Blue</NestedColorBackground>
    <NestedColorBackground $color="default">Default</NestedColorBackground>
  </div>
);

const styles = stylex.create({
  mixedBackgroundNotUseGradient: {
    backgroundColor: "green",
  },
  mixedBackgroundUseGradient: {
    backgroundImage: "linear-gradient(90deg, red, blue)",
  },
  nestedColorBackground: {
    backgroundColor: "gray",
  },
});

const $colorVariants = stylex.create({
  red: {
    backgroundColor: "crimson",
  },
  blue: {
    backgroundColor: "navy",
  },
  default: {
    backgroundColor: "gray",
  },
});
