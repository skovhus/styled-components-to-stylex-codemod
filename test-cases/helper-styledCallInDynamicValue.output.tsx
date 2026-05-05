// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors, $shadow } from "./tokens.stylex";
import type { ColorToken } from "./tokens.stylex";

type ShadowToken = "dark" | "light";

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

type LoadingPlaceholderRepeatProps = React.PropsWithChildren<{
  highlightColor: ColorToken;
}>;

function LoadingPlaceholderRepeat(props: LoadingPlaceholderRepeatProps) {
  const { children, highlightColor } = props;
  return (
    <div
      sx={[
        styles.loadingPlaceholderRepeat,
        styles.loadingPlaceholderRepeatBackgroundImage($colors[highlightColor]),
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
    <LoadingPlaceholderRepeat highlightColor="accent" />
    <div sx={styles.shadowPlaceholder("dark")} />
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
  loadingPlaceholderRepeat: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderRepeatBackgroundImage: (resolvedHighlightColor: string) => ({
    backgroundImage: `linear-gradient(90deg, ${resolvedHighlightColor}, ${resolvedHighlightColor})`,
  }),
  shadowPlaceholder: (textShadow: ShadowToken) => ({
    width: 160,
    height: 20,
    borderRadius: 6,
    backgroundColor: "white",
    textShadow: $shadow[textShadow],
  }),
});
