import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $bg: Color;
  $hoverColor: Color;
};

function Box(props: BoxProps) {
  const { children, $hoverColor, $bg } = props;
  return (
    <div
      {...stylex.props(
        styles.box,
        styles.boxBackgroundColorHover($hoverColor),
        styles.boxBackgroundColor($bg),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <>
    <Box $bg="labelBase" $hoverColor="labelMuted" />
    <Box $bg="labelMuted" $hoverColor="labelBase" />
  </>
);

// Pattern 2: Type imported from another file (like TextColor.tsx in a design system)
// The codemod should preserve the imported type, not convert to `string`
import type { Colors } from "./lib/colors";

interface TextColorProps extends Omit<React.ComponentProps<"span">, "className" | "style"> {
  /** The color from the theme */
  color: Colors;
}

export function TextColor(props: TextColorProps) {
  const { children, color, ...rest } = props;
  return (
    <span {...rest} {...stylex.props(styles.textColorColor(color))}>
      {children}
    </span>
  );
}

const styles = stylex.create({
  box: {
    width: "42px",
    height: "100%",
    padding: "16px",
  },
  boxBackgroundColorHover: ($hoverColor: Color) => ({
    backgroundColor: {
      default: null,
      ":hover": $colors[$hoverColor],
    },
  }),
  boxBackgroundColor: ($bg: Color) => ({
    backgroundColor: $colors[$bg],
  }),
  textColorColor: (color: Colors) => ({
    color: $colors[color],
  }),
});
