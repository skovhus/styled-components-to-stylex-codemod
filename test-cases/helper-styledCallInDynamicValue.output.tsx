// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors, $shadow, $glowShadow } from "./tokens.stylex";
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

type LoadingPlaceholderWithHelperReturnProps = React.PropsWithChildren<{
  highlightColor: ColorToken;
}>;

function LoadingPlaceholderWithHelperReturn(props: LoadingPlaceholderWithHelperReturnProps) {
  const { children, highlightColor } = props;
  return (
    <div
      sx={[
        styles.loadingPlaceholderWithHelperReturn,
        styles.loadingPlaceholderWithHelperReturnBackgroundImage($colors[highlightColor]),
      ]}
    >
      {children}
    </div>
  );
}

type LoadingPlaceholderWithDestructuredTemplateProps = React.PropsWithChildren<{
  shimmerColor: ColorToken;
}>;

function LoadingPlaceholderWithDestructuredTemplate(
  props: LoadingPlaceholderWithDestructuredTemplateProps,
) {
  const { children, shimmerColor } = props;
  return (
    <div
      sx={[
        styles.loadingPlaceholderWithDestructuredTemplate,
        styles.loadingPlaceholderWithDestructuredTemplateBackgroundImage($colors[shimmerColor]),
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

export const App = () => {
  const runtimeHighlightColor: ColorToken = "accent";

  return (
    <div style={{ display: "grid", gap: 8, padding: 12 }}>
      <LoadingPlaceholder highlightColor="accent" />
      <LoadingPlaceholderWithHelperReturn highlightColor={runtimeHighlightColor} />
      <LoadingPlaceholderWithDestructuredTemplate shimmerColor={runtimeHighlightColor} />
      <LoadingPlaceholderRange startColor="labelBase" endColor="accent" />
      <LoadingPlaceholderRepeat highlightColor="accent" />
      <LoadingPlaceholderWithSize highlightColor="accent" size={12} />
      <div sx={styles.shadowPlaceholder("dark")} />
      <LayeredShadowPlaceholder shadowTone="light" />
    </div>
  );
};

const styles = stylex.create({
  loadingPlaceholder: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderBackgroundImage: (resolvedColorHighlightColor: string) => ({
    backgroundImage: `linear-gradient(90deg, transparent, ${resolvedColorHighlightColor}, transparent)`,
  }),
  loadingPlaceholderWithHelperReturn: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderWithHelperReturnBackgroundImage: (resolvedColorHighlightColor: string) => ({
    backgroundImage: `linear-gradient(
    90deg,
    transparent,
    ${resolvedColorHighlightColor},
    transparent
  )`,
  }),
  loadingPlaceholderWithDestructuredTemplate: {
    width: 160,
    height: 20,
    borderRadius: 6,
  },
  loadingPlaceholderWithDestructuredTemplateBackgroundImage: (
    resolvedColorShimmerColor: string,
  ) => ({
    backgroundImage: `linear-gradient(90deg, transparent 0, ${resolvedColorShimmerColor} 50%, transparent)`,
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
