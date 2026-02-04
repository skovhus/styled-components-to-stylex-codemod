import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Colors = "labelBase" | "labelMuted";

type DotProps = React.PropsWithChildren<{
  $colors: Colors;
}>;

function Dot(props: DotProps) {
  const { children, $colors } = props;

  return <div {...stylex.props(styles.dotBackgroundColor($colors))}>{children}</div>;
}

export const App = () => <Dot $colors="labelBase">Hello</Dot>;

const styles = stylex.create({
  dotBackgroundColor: ($colorsValue: Colors) => ({
    backgroundColor: $colors[$colorsValue],
  }),
});
