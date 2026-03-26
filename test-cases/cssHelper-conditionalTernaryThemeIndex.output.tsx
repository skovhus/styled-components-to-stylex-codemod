// CSS helper with conditional ternary branches and theme indexed lookup
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import type { Colors } from "./lib/colors";

type ThingProps = React.PropsWithChildren<{
  outlined: boolean;
  color?: Colors;
}>;

function Thing(props: ThingProps) {
  const { children, outlined, color } = props;
  return (
    <div
      sx={[
        styles.thing,
        outlined && styles.thingOutline(`1px solid ${color ? $colors[color] : $colors.labelMuted}`),
        !outlined && styles.thingBackgroundColor(color ? $colors[color] : $colors.labelMuted),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
    <Thing outlined>Outlined default</Thing>
    <Thing outlined color="labelBase">
      Outlined custom
    </Thing>
    <Thing outlined={false}>Background default</Thing>
    <Thing outlined={false} color="labelBase">
      Background custom
    </Thing>
  </div>
);

const styles = stylex.create({
  thing: {
    display: "flex",
  },
  thingOutline: (outline: string) => ({
    outline,
  }),
  thingBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
