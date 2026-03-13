import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  depth: number;
}>;

function Box(props: BoxProps) {
  const { children, depth } = props;

  return <div sx={[styles.box, styles.boxPaddingLeft(props)]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Box depth={0}>Depth 0</Box>
    <Box depth={1}>Depth 1</Box>
    <Box depth={2}>Depth 2</Box>
    <Box depth={3}>Depth 3</Box>
  </div>
);

const styles = stylex.create({
  box: {
    backgroundColor: "red",
    padding: 8,
    color: "white",
  },
  boxPaddingLeft: (props: BoxProps) => ({
    paddingLeft: `${props.depth * 16 + 4}px`,
  }),
});
