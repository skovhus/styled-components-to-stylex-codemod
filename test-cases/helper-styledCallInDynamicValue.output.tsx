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

type LoadingPlaceholderRangeProps = React.PropsWithChildren<{
  startColor: ColorToken;
  endColor: ColorToken;
}>;

function LoadingPlaceholderRange(props: LoadingPlaceholderRangeProps) {
  const { children, startColor, endColor } = props;
  return (
    <div
      sx={[
        styles.loadingPlaceholderRange,
        styles.loadingPlaceholderRangeBackgroundImage($colors[startColor], $colors[endColor]),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <LoadingPlaceholder highlightColor="accent" />
    <LoadingPlaceholderRange startColor="labelBase" endColor="accent" />
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
  loadingPlaceholderRange: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderRangeBackgroundImage: (
    resolvedStartColor: string,
    resolvedEndColor: string,
  ) => ({
    backgroundImage: `linear-gradient(90deg, ${resolvedStartColor}, ${resolvedEndColor})`,
  }),
});
