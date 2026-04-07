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
  return (
    <div
      sx={[
        styles.box,
        styles.boxBackgroundColorHover(hoverColor),
        $colorMixins.backgroundColor[bg],
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
    <span {...rest} {...stylex.props($colorMixins.color[color])}>
      {children}
    </span>
  );
}

// Pattern 3: Indexed theme lookup BEFORE a conditional — cascade order must be preserved.
// The indexed lookup should NOT override the conditional's value.
interface OrderedProps {
  bg: Color;
  active?: boolean;
}

function OrderedBox(props: React.PropsWithChildren<OrderedProps>) {
  const { children, bg, active } = props;
  return (
    <div
      sx={[
        styles.orderedBox,
        $colorMixins.backgroundColor[bg],
        active ? styles.orderedBoxActive : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export function OrderedApp() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <OrderedBox bg="labelBase">Inactive</OrderedBox>
      <OrderedBox bg="labelBase" active>
        Active (should be red)
      </OrderedBox>
    </div>
  );
}

const styles = stylex.create({
  box: {
    width: 42,
    height: "100%",
    padding: 16,
  },
  boxBackgroundColorHover: (hoverColor: Color) => ({
    backgroundColor: {
      default: null,
      ":hover": $colors[hoverColor],
    },
  }),
  orderedBox: {
    padding: 8,
  },
  orderedBoxActive: {
    backgroundColor: "red",
  },
});
