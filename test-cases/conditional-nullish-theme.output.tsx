import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, themeVars } from "./tokens.stylex";

type LineProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $isRemoval?: boolean;
  $deletionColor?: string;
};

function Line(props: LineProps) {
  const { children, $isRemoval, $deletionColor } = props;
  return (
    <div
      {...stylex.props(
        styles.line,
        $isRemoval && styles.lineBackgroundColor($deletionColor ?? themeVars.bgBase),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
    <Line />
    <Line $isRemoval />
    <Line $isRemoval $deletionColor="#ff0000" />
  </div>
);

const styles = stylex.create({
  line: {
    height: pixelVars.thin,
    backgroundColor: themeVars.bgSub,
    margin: "10px",
  },
  lineBackgroundColor: (backgroundColor: string) => ({
    backgroundColor: backgroundColor,
  }),
});
