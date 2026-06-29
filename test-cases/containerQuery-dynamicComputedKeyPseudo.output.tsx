import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  active?: boolean;
}>;

export function Box(props: BoxProps) {
  const { active, ...rest } = props;
  return <div {...rest} sx={[styles.box, active && styles.boxActive]} />;
}

export const App = () => (
  <div style={{ containerType: "inline-size", display: "flex", gap: "8px" }}>
    <Box>Default</Box>
    <Box active>Active</Box>
  </div>
);

const styles = stylex.create({
  box: {
    color: {
      default: "black",
      ":hover": "red",
      ["@container panel (max-width: 640px)"]: "gray",
    },
    backgroundColor: "#1e293b",
    padding: 16,
  },
  boxActive: {
    color: {
      default: "white",
      ["@container panel (max-width: 640px)"]: "yellow",
    },
  },
});
