import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

type LineProps = Omit<React.ComponentProps<"div">, "style" | "className"> & {
  $isRemoval?: boolean;
  $deletionColor?: string;
};

function Line(props: LineProps) {
  const { children, $isRemoval, $deletionColor } = props;
  return (
    <div
      {...stylex.props(
        styles.line,
        $isRemoval ? styles.lineBackgroundColor($deletionColor ?? $colors.bgBase) : undefined,
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
    backgroundColor: $colors.bgSub,
    margin: "10px",
  },
  lineBackgroundColor: (backgroundColor: string) => ({
    backgroundColor: backgroundColor,
  }),
});
