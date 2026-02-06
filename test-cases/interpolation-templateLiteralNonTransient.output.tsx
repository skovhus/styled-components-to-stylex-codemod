import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  size?: number;
};

// Template literal with non-transient props should emit StyleX style functions.
// These are props without the $ prefix that are used in template literal interpolations.

function Box(props: BoxProps) {
  const { children, size } = props;

  return (
    <div
      {...stylex.props(
        styles.box,
        styles.boxWidth({
          size,
        }),
        styles.boxHeight({
          size,
        }),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Box size={150}>150x150</Box>
    <Box size={100}>100x100</Box>
    <Box>Default (100x100)</Box>
  </div>
);

const styles = stylex.create({
  // Template literal with non-transient props should emit StyleX style functions.
  // These are props without the $ prefix that are used in template literal interpolations.

  box: {
    padding: "8px",
    backgroundColor: "paleturquoise",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "teal",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "8px",
  },
  boxWidth: (props) => ({
    width: `${props.size ?? 100}px`,
  }),
  boxHeight: (props) => ({
    height: `${props.size ?? 100}px`,
  }),
});
