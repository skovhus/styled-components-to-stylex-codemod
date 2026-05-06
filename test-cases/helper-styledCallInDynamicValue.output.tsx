// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors, $shadow, $glowShadow } from "./tokens.stylex";
import { color } from "./lib/color-helper";
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

type OptionalColorPanelProps = React.PropsWithChildren<{
  color?: ColorToken;
}>;

function OptionalColorPanel(props: OptionalColorPanelProps) {
  const { children, color } = props;
  return (
    <div
      sx={[
        styles.optionalColorPanel,
        styles.optionalColorPanelBackgroundColor($colors[color ?? "labelFaint"]),
      ]}
    >
      {children}
    </div>
  );
}

type LoadingPlaceholderWithSizeProps = React.PropsWithChildren<{
  highlightColor: ColorToken;
  size: number;
}>;

function LoadingPlaceholderWithSize(props: LoadingPlaceholderWithSizeProps) {
  const { children, highlightColor, size } = props;
  return (
    <div
      sx={[
        styles.loadingPlaceholderWithSize,
        styles.loadingPlaceholderWithSizeBackgroundImage(props, $colors[highlightColor]),
      ]}
    >
      {children}
    </div>
  );
}

type LayeredShadowPlaceholderProps = React.PropsWithChildren<{
  shadowTone: ShadowToken;
}>;

function LayeredShadowPlaceholder(props: LayeredShadowPlaceholderProps) {
  const { children, shadowTone } = props;
  return (
    <div
      sx={[
        styles.layeredShadowPlaceholder,
        styles.layeredShadowPlaceholderTextShadow($shadow[shadowTone], $glowShadow[shadowTone]),
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
    <OptionalColorPanel>Default faint panel</OptionalColorPanel>
    <OptionalColorPanel color="accent">Accent panel</OptionalColorPanel>
    <LoadingPlaceholderWithSize highlightColor="accent" size={12} />
    <div sx={styles.shadowPlaceholder("dark")} />
    <LayeredShadowPlaceholder shadowTone="light" />
  </div>
);

const styles = stylex.create({
  loadingPlaceholder: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderBackgroundImage: (resolvedColorHighlightColor: string) => ({
    backgroundImage: `linear-gradient(90deg, transparent, ${resolvedColorHighlightColor}, transparent)`,
  }),
  loadingPlaceholderRange: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderRangeBackgroundImage: (
    resolvedColorStartColor: string,
    resolvedColorEndColor: string,
  ) => ({
    backgroundImage: `linear-gradient(90deg, ${resolvedColorStartColor}, ${resolvedColorEndColor})`,
  }),
  loadingPlaceholderRepeat: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderRepeatBackgroundImage: (resolvedColorHighlightColor: string) => ({
    backgroundImage: `linear-gradient(90deg, ${resolvedColorHighlightColor}, ${resolvedColorHighlightColor})`,
  }),
  optionalColorPanel: {
    width: 160,
    minHeight: 40,
    borderRadius: 6,
    padding: 8,
    color: "white",
  },
  optionalColorPanelBackgroundColor: (resolvedColorColor: string) => ({
    backgroundColor: `${resolvedColorColor} !important`,
  }),
  loadingPlaceholderWithSize: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderWithSizeBackgroundImage: (
    props: LoadingPlaceholderWithSizeProps,
    resolvedColorHighlightColor: string,
  ) => ({
    backgroundImage: `linear-gradient(90deg, ${resolvedColorHighlightColor} ${props.size}px, transparent)`,
  }),
  shadowPlaceholder: (textShadow: ShadowToken) => ({
    width: 160,
    height: 20,
    borderRadius: 6,
    backgroundColor: "white",
    textShadow: $shadow[textShadow],
  }),
  layeredShadowPlaceholder: {
    width: 160,
    height: 20,
    borderRadius: 6,
    backgroundColor: "white",
  },
  layeredShadowPlaceholderTextShadow: (shadowShadowTone: string, glowShadowShadowTone: string) => ({
    textShadow: `${shadowShadowTone}, ${glowShadowShadowTone}`,
  }),
});
