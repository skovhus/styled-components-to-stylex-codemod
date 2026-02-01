import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { borders } from "./lib/helpers.stylex";
import { $colors } from "./tokens.stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  position: "top" | "bottom";
};

function Box(props: BoxProps) {
  const { children, position } = props;
  return (
    <div
      {...stylex.props(styles.box, position === "top" && borders.labelMuted, styles.borderBottom)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ margin: "10px", padding: "10px", height: "100px" }}>
    <Box position="top">Top box with themed border</Box>
    <Box position="bottom">Bottom box without border</Box>
  </div>
);

const styles = stylex.create({
  box: {
    padding: "8px",
  },
  borderBottom: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgSub,
  },
});
