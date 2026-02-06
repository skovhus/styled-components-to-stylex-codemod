import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: The output references a bare `color` variable that was never destructured
// from props (`color != null && styles.badgeBackgroundColor(color)`).
// The `color` prop should be extracted as `props.color`. Causes TS2304/TS7053.

type Size = "tiny" | "small" | "normal";

type Props = {
  color?: string;
  size?: Size;
};

type BadgeProps = Omit<React.ComponentProps<"div">, "className" | "style"> & Props;

export function Badge(props: BadgeProps) {
  const { children, size: size = "normal", color, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.badge,
        sizeVariants[size],
        color != null && styles.badgeBackgroundColor(color),
      )}
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
    width: "12px",
    height: "12px",
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
