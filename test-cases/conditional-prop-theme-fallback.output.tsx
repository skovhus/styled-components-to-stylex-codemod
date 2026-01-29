import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Size = "tiny" | "small" | "normal";

type Props = {
  color?: string;
  hollow?: boolean;
  size?: Size;
};

type ColorBadgeProps = Omit<React.ComponentProps<"div">, "className" | "style"> & Props;

export function ColorBadge(props: ColorBadgeProps) {
  const { children, hollow, color, size: size = "normal" } = props;
  return (
    <div
      {...stylex.props(
        styles.colorBadge,
        hollow && styles.colorBadgeHollow,
        sizeVariants[size],
        hollow ? styles.colorBadgeBorderColor(color ? color : $colors.labelMuted) : undefined,
        !hollow && styles.colorBadgeBackgroundColor(color ? color : $colors.labelMuted),
      )}
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
    width: "12px",
    height: "12px",
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
    width: "7px",
    height: "7px",
  },
  small: {
    width: "9px",
    height: "9px",
  },
  normal: {
    width: "12px",
    height: "12px",
  },
});
