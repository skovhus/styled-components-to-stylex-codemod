import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  size?: number;
}>;

// Template literal with non-transient props should emit StyleX style functions.
// These are props without the $ prefix that are used in template literal interpolations.

function Box(props: BoxProps) {
  const { children, size } = props;

  return <div sx={[styles.box, styles.boxWidth(props), styles.boxHeight(props)]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Box size={150}>150x150</Box>
    <Box size={100}>100x100</Box>
    <Box>Default (100x100)</Box>
  </div>
);

const styles = stylex.create({
  box: {
    padding: 8,
    backgroundColor: "paleturquoise",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "teal",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: 8,
  },
  boxWidth: (props: BoxProps) => ({
    width: `${props.size ?? 100}px`,
  }),
  boxHeight: (props: BoxProps) => ({
    height: `${props.size ?? 100}px`,
  }),
});
