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

  return <div {...stylex.props(styles.viewBackgroundColor(backgroundColor))}>{children}</div>;
}

export const App = () => (
  <>
    <View backgroundColor="labelBase" />
    <View backgroundColor="labelMuted" />
  </>
);

const styles = stylex.create({
  viewBackgroundColor: (backgroundColor: Color) => ({
    backgroundColor: $colors[backgroundColor] || `${backgroundColor}`,
  }),
});
