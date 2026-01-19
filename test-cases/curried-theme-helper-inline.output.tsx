import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { borders } from "./lib/helpers.stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  position: "top" | "bottom";
};

function Box(props: BoxProps) {
  const { children, position } = props;
  return <div {...stylex.props(styles.box, position === "top" && borders.labelMuted)}>{children}</div>;
}

export const App = () => (
  <span>
    <Box position="top">Top box with themed border</Box>
    <Box position="bottom">Bottom box without border</Box>
  </span>
);

const styles = stylex.create({
  box: {
    padding: "8px",
  },
});
