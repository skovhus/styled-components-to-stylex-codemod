import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type RangeInputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Pattern: styled("input") needs HTML input attributes (max, min, type, etc.)
// The generated type must extend React.InputHTMLAttributes<HTMLInputElement>

/**
 * A range input component.
 * Should accept all HTML input attributes like max, min, type, value, onChange, etc.
 */
export function RangeInput(props: RangeInputProps) {
  const { className, style, ...rest } = props;
  return <input {...rest} {...mergedSx(styles.rangeInput, className, style)} />;
}

// Usage should work with HTML input attributes
export const App = () => (
  <div>
    <RangeInput type="range" max={100} min={0} />
    <RangeInput type="text" placeholder="Enter text" />
  </div>
);

const styles = stylex.create({
  rangeInput: {
    display: "block",
    width: "300px",
    height: "6px",
    borderRadius: "99999px",
    appearance: "none",
  },
});
