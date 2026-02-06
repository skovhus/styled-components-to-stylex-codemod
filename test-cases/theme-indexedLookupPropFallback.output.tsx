// Indexed theme lookup with prop fallback using || operator
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type ViewProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  backgroundColor: Color;
};

function View(props: ViewProps) {
  const { children, backgroundColor } = props;

  return (
    <div {...stylex.props(styles.view, styles.viewBackgroundColor(backgroundColor))}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <View backgroundColor="labelBase">labelBase</View>
    <View backgroundColor="labelMuted">labelMuted</View>
  </div>
);

const styles = stylex.create({
  view: {
    color: "white",
    paddingBlock: "12px",
    paddingInline: "16px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
  },
  viewBackgroundColor: (backgroundColor: Color) => ({
    backgroundColor: $colors[backgroundColor] || `${backgroundColor}`,
  }),
});
