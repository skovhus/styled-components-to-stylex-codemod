import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type InputProps = { placeholderColor: Color } & Pick<React.ComponentProps<"input">, "placeholder">;

function Input(props: InputProps) {
  const { placeholderColor, ...rest } = props;
  return <input {...rest} sx={[styles.input, styles.inputPlaceholderColor(placeholderColor)]} />;
}

type BadgeProps = React.PropsWithChildren<{
  indicatorColor: Color;
}>;

// Indexed theme lookup in ::after pseudo-element
function Badge(props: BadgeProps) {
  const { children, indicatorColor } = props;
  return (
    <span sx={[styles.badge, styles.badgeAfterBackgroundColor(indicatorColor)]}>{children}</span>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <Input placeholderColor="labelBase" placeholder="Base color" />
    <Input placeholderColor="labelMuted" placeholder="Muted color" />
    <Badge indicatorColor="labelBase">Base</Badge>
    <Badge indicatorColor="labelMuted">Muted</Badge>
  </div>
);

const styles = stylex.create({
  input: {
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  inputPlaceholderColor: (placeholderColor: Color) => ({
    "::placeholder": {
      color: $colors[placeholderColor],
    },
  }),
  badge: {
    position: "relative",
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: "#eee",
    "::after": {
      content: '""',
      display: "block",
      height: 3,
    },
  },
  badgeAfterBackgroundColor: (indicatorColor: Color) => ({
    "::after": {
      backgroundColor: $colors[indicatorColor],
    },
  }),
});
