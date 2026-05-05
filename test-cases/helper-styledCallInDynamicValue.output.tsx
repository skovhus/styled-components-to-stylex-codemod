// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import type { ColorToken } from "./tokens.stylex";

type LoadingPlaceholderProps = React.PropsWithChildren<{
  highlightColor: ColorToken;
}>;

function LoadingPlaceholder(props: LoadingPlaceholderProps) {
  const { children, highlightColor } = props;
  return (
    <div
      sx={[
        styles.loadingPlaceholder,
        styles.loadingPlaceholderBackgroundImage($colors[highlightColor]),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <LoadingPlaceholder highlightColor="accent" />
  </div>
);

const styles = stylex.create({
  loadingPlaceholder: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderBackgroundImage: (resolvedHighlightColor: string) => ({
    backgroundImage: `linear-gradient(90deg, transparent, ${resolvedHighlightColor}, transparent)`,
  }),
});
