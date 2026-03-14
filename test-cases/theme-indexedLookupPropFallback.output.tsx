// Indexed theme lookup with prop fallback using || operator
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Color = "labelBase" | "labelMuted";

type ViewProps = React.PropsWithChildren<{
  backgroundColor: Color;
}>;

function View(props: ViewProps) {
  const { children, backgroundColor } = props;

  return <div sx={[styles.view, styles.viewBackgroundColor(backgroundColor)]}>{children}</div>;
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
    paddingBlock: 12,
    paddingInline: 16,
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
  },
  viewBackgroundColor: (backgroundColor: Color) => ({
    // eslint-disable-next-line stylex/valid-styles -- dynamic style fn param
    backgroundColor: $colors[backgroundColor] || `${backgroundColor}`,
  }),
});
