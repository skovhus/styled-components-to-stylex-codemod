import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Size = "tiny" | "small" | "normal";

type Props = {
  color?: string;
  size?: Size;
};

export function Badge(props: Props & Omit<React.ComponentProps<"div">, "className" | "style">) {
  const { children, size = "normal", color, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[styles.badge, sizeVariants[size], color != null && styles.badgeBackgroundColor(color)]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Badge color="red" size="tiny" />
    <Badge color="blue" size="small" />
    <Badge color="green" />
    <Badge />
  </div>
);

const styles = stylex.create({
  badge: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    flexShrink: 0,
    backgroundColor: "gray",
  },
  badgeBackgroundColor: (backgroundColor: string) => ({
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
