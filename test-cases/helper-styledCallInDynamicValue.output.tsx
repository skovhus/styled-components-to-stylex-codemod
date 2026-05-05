import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors, type ColorToken } from "./tokens.stylex";

type LoadingPlaceholderProps = {
  highlightColor: ColorToken;
};

function LoadingPlaceholder(props: LoadingPlaceholderProps) {
  const { highlightColor } = props;
  return <div sx={styles.loadingPlaceholder($colors[highlightColor])} />;
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <LoadingPlaceholder highlightColor="accent" />
  </div>
);

const styles = stylex.create({
  loadingPlaceholder: (resolvedHighlightColor: string) => ({
    width: 160,
    height: 20,
    borderRadius: 6,
    backgroundImage: `linear-gradient(90deg, transparent, ${resolvedHighlightColor}, transparent)`,
  }),
});
