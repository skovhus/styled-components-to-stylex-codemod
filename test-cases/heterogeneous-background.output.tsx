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

export const App = () => (
  <div>
    <MixedBackground $useGradient={false}>Solid Color</MixedBackground>
    <MixedBackground $useGradient={true}>Gradient</MixedBackground>
  </div>
);

const styles = stylex.create({
  mixedBackgroundNotUseGradient: {
    backgroundColor: "green",
  },
  mixedBackgroundUseGradient: {
    backgroundImage: "linear-gradient(90deg, red, blue)",
  },
});
