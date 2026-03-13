import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type BoxProps = React.PropsWithChildren<{
  bg: Color;
  hoverColor: Color;
}>;

function Box(props: BoxProps) {
  const { children, hoverColor, bg } = props;

  return (
    <div
      sx={[
        styles.box,
        styles.boxBackgroundColorHover({
          hoverColor: hoverColor,
        }),
        styles.boxBackgroundColor({
          bg: bg,
        }),
      ]}
    >
      {children}
    </div>
  );
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
  props: TextColorProps & Omit<React.ComponentProps<"span">, "className" | "style">,
) {
  const { children, color, ...rest } = props;

  return (
    <span
      {...rest}
      sx={styles.textColorColor({
        color: color,
      })}
    >
      {children}
    </span>
  );
}

const styles = stylex.create({
  box: {
    width: 42,
    height: "100%",
    padding: 16,
  },
  boxBackgroundColorHover: (props: { hoverColor: Color }) => ({
    backgroundColor: {
      default: null,
      ":hover": $colors[props.hoverColor],
    },
  }),
  boxBackgroundColor: (props: { bg: Color }) => ({
    backgroundColor: $colors[props.bg],
  }),
  textColorColor: (props: { color: Colors }) => ({
    color: $colors[props.color],
  }),
});
