import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type RuntimeBackgroundProps = React.PropsWithChildren<{
  active?: boolean;
  background?: string;
}>;

function RuntimeBackground(props: RuntimeBackgroundProps) {
  const { children, active, background } = props;
  return (
    <div
      sx={[
        styles.runtimeBackground,
        background != null && styles.runtimeBackgroundBackgroundColor(background),
        active && styles.runtimeBackgroundActive,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <RuntimeBackground />
  </div>
);

const styles = stylex.create({
  runtimeBackground: {
    width: 80,
    height: 40,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#94a3b8",
    backgroundColor: "transparent",
  },
  runtimeBackgroundActive: {
    backgroundColor: {
      default: null,
      ":hover": $colors.bgBorderSolid,
    },
  },
  runtimeBackgroundBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
