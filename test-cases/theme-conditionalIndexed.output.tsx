import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import type { Colors } from "./lib/colors";

export interface BadgeProps extends Omit<React.ComponentProps<"div">, "className" | "style"> {
  textColor?: Colors;
}

export function Badge(props: BadgeProps) {
  const { children, textColor, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(styles.badge, textColor ? styles.badgeColor(textColor) : undefined)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Badge>Default color (labelTitle)</Badge>
    <Badge textColor="labelBase">Custom color (labelBase)</Badge>
    <Badge textColor="labelMuted">Custom color (labelMuted)</Badge>
  </div>
);

const styles = stylex.create({
  badge: {
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: "4px",
    color: $colors.labelTitle,
  },
  badgeColor: (textColor: Colors) => ({
    color: $colors[textColor],
  }),
});
