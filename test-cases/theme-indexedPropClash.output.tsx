import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type Colors = "labelBase" | "labelMuted";

type DotProps = React.PropsWithChildren<{
  $colors: Colors;
}>;

function Dot(props: DotProps) {
  const { children, $colors } = props;

  return (
    <div
      sx={styles.dotBackgroundColor({
        $colorsValue: $colors,
      })}
    >
      {children}
    </div>
  );
}

export const App = () => <Dot $colors="labelBase">Hello</Dot>;

const styles = stylex.create({
  dotBackgroundColor: (props: { $colorsValue: Colors }) => ({
    backgroundColor: $colors[props.$colorsValue],
  }),
});
