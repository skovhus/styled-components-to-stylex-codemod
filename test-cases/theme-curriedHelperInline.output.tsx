import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  position: "top" | "bottom";
};

function Box(props: BoxProps) {
  const { children, position } = props;

  return (
    <div
      {...stylex.props(
        styles.box,
        styles.borderBottom,
        position === "top" && styles.boxPositionTop,
      )}
    >
      {children}
    </div>
  );
}

function BorderedBox(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(styles.border)}>{children}</div>;
}

export const App = () => (
  <div style={{ margin: "10px", padding: "10px", height: "100px" }}>
    <Box position="top">Top box with themed border</Box>
    <Box position="bottom">Bottom box without border</Box>
    <BorderedBox>Bordered box</BorderedBox>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "8px",
    borderStyle: "none",
  },
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
  boxPositionTop: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
  border: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
});
