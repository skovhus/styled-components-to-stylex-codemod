import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colorMixins } from "./lib/colorMixins.stylex";

type Colors = "labelBase" | "labelMuted";

type DotProps = React.PropsWithChildren<{
  colors: Colors;
}>;

function Dot(props: DotProps) {
  const { children, colors } = props;
  return <div sx={[styles.dot, $colorMixins.backgroundColor[colors]]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 12 }}>
    <Dot colors="labelBase">labelBase</Dot>
    <Dot colors="labelMuted">labelMuted</Dot>
  </div>
);

const styles = stylex.create({
  dot: {
    minHeight: 48,
    minWidth: 96,
    padding: 12,
  },
});
