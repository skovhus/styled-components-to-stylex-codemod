import * as stylex from "@stylexjs/stylex";
import * as React from "react";

const styles = stylex.create({
  rangeInput: {
    display: "block",
    width: "300px",
    height: "6px",
    appearance: "none",
    backgroundColor: "gray",
  },
});

type RangeInputProps = React.ComponentProps<"input">;

/**
 * A range input component.
 */
export function RangeInput(props: RangeInputProps) {
  const { style, ...rest } = props;
  return <input type="range" {...rest} {...stylex.props(styles.rangeInput)} style={style} />;
}

export function App() {
  return null;
}
