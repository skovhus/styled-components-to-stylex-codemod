import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

type TitleTextProps = React.PropsWithChildren<{
  oneLine?: boolean;
}>;

// Destructured default should preserve `undefined` semantics:
// omitted $oneLine uses the default true branch.
function TitleText(props: TitleTextProps) {
  const { children, oneLine = true } = props;

  return (
    <div
      sx={[styles.titleText, oneLine ? helpers.truncateMultiline(1) : helpers.truncateMultiline(2)]}
    >
      {children}
    </div>
  );
}

type ColorTitleTextProps = React.PropsWithChildren<{
  oneLine?: boolean;
}>;

// When the same prop also drives another interpolation, wrapper-level defaulting
// must not be hoisted globally (it would change the second interpolation semantics).
function ColorTitleText(props: ColorTitleTextProps) {
  const { children, oneLine } = props;

  return (
    <div
      sx={[
        oneLine === undefined || oneLine
          ? helpers.truncateMultiline(1)
          : helpers.truncateMultiline(2),
        styles.colorTitleText({
          color: props.oneLine === undefined ? "purple" : "teal",
        }),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText>Default one-line (safe to hoist default)</TitleText>
    <TitleText oneLine={false}>Two-line truncated</TitleText>
    <ColorTitleText>Default one-line and purple</ColorTitleText>
    <ColorTitleText oneLine={false}>Two-line and teal</ColorTitleText>
  </div>
);

const styles = stylex.create({
  titleText: {
    lineHeight: "1rem",
  },
  colorTitleText: (props: { color: string | undefined }) => ({
    lineHeight: "1rem",
    // eslint-disable-next-line stylex/valid-styles -- dynamic style fn param
    color: props.color,
  }),
});
