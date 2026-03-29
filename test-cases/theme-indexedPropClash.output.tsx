import * as React from "react";
import { $colorMixins } from "./lib/colorMixins.stylex";

type Colors = "labelBase" | "labelMuted";

type DotProps = React.PropsWithChildren<{
  colors: Colors;
}>;

function Dot(props: DotProps) {
  const { children, colors } = props;
  return <div sx={$colorMixins.backgroundColor[colors]}>{children}</div>;
}

export const App = () => <Dot colors="labelBase">Hello</Dot>;
