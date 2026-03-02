import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = { active?: boolean };

function Box(props: React.PropsWithChildren<BoxProps>) {
  const { children, active } = props;

  return <div {...stylex.props(styles.box, active ? styles.boxActive : undefined)}>{children}</div>;
}

export const App = () => (
  <div>
    <Box active>Active</Box>
    <Box>Inactive</Box>
  </div>
);

const styles = stylex.create({
  box: {
    backgroundColor: "gray",
    padding: "16px",
  },
  boxActive: {
    backgroundColor: "blue",
  },
});
