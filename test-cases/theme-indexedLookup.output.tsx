import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colorMixins } from "./lib/colorMixins.stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type BoxProps = React.PropsWithChildren<{
  bg: Color;
  hoverColor: Color;
}>;

function Box(props: BoxProps) {
  const { children, hoverColor, bg } = props;
  return <div sx={[styles.box, styles.boxBackgroundColorHover(hoverColor, bg)]}>{children}</div>;
}

export const App = () => (
  <>
    <Box bg="labelBase" hoverColor="labelMuted" />
    <Box bg="labelMuted" hoverColor="labelBase" />
  </>
);

// Pattern 2: Type imported from another file (like TextColor.tsx in a design system)
// The codemod should preserve the imported type, not convert to `string`
import type { Colors } from "./lib/colors";

interface TextColorProps {
  /** The color from the theme */
  color: Colors;
}

export function TextColor(
  props: TextColorProps & Omit<React.ComponentProps<"span">, "className" | "style" | "sx">,
) {
  const { color, ...rest } = props;
  return <span {...rest} {...stylex.props($colorMixins.color[color])} />;
}

const styles = stylex.create({
  box: {
    width: 42,
    height: "100%",
    padding: 16,
  },
  boxBackgroundColorHover: (hoverColor: Color, bg: Color) => ({
    backgroundColor: {
      default: $colors[bg],
      ":hover": $colors[hoverColor],
    },
  }),
});
