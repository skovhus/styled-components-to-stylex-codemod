import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

type BoxProps = React.PropsWithChildren<{
  position: "top" | "bottom";
}>;

function Box(props: BoxProps) {
  const { children, position } = props;
  return (
    <div sx={[styles.box, position === "top" && styles.boxPositionTop, styles.boxBorderBottom]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ margin: "10px", padding: "10px", height: "100px" }}>
    <Box position="top">Top box with themed border</Box>
    <Box position="bottom">Bottom box without border</Box>
    <div sx={styles.borderedBoxBorder}>Bordered box</div>
  </div>
);

const styles = stylex.create({
  box: {
    padding: 8,
    borderStyle: "none",
  },
  boxBorderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
  boxPositionTop: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
  borderedBoxBorder: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
});
