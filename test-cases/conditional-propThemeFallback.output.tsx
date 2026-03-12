import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Size = "tiny" | "small" | "normal";

type Props = {
  color?: string;
  hollow?: boolean;
  size?: Size;
};

export function ColorBadge(
  props: Props & Omit<React.ComponentProps<"div">, "className" | "style">,
) {
  const { children, hollow, color, size = "normal", ...rest } = props;

  return (
    <div
      {...rest}
      sx={[
        styles.colorBadge,
        hollow ? styles.colorBadgeHollow : undefined,
        hollow ? styles.colorBadgeBorderColor(color ? color : $colors.labelMuted) : undefined,
        !hollow && styles.colorBadgeBackgroundColor(color ? color : $colors.labelMuted),
        sizeVariants[size],
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <ColorBadge />
    <ColorBadge color="hotpink" />
    <ColorBadge hollow />
    <ColorBadge hollow color="hotpink" />
    <ColorBadge size="tiny" />
    <ColorBadge size="small" />
    <ColorBadge color="#ff0000" />
  </div>
);

const styles = stylex.create({
  colorBadge: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    flexShrink: 0,
  },
  colorBadgeHollow: {
    borderWidth: "1px",
    borderStyle: "solid",
  },
  colorBadgeBorderColor: (borderColor: string) => ({
    borderColor,
  }),
  colorBadgeBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});

const sizeVariants = stylex.create({
  tiny: {
    width: 7,
    height: 7,
  },
  small: {
    width: 9,
    height: 9,
  },
  normal: {
    width: 12,
    height: 12,
  },
});
