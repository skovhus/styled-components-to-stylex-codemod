import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { useTheme } from "styled-components";

type InputProps = {
  /** id for accessibility focus from label */
  id?: string;
};

/**
 * Color input, in the form of a clickable square that opens up a color picker
 */
export function Input(props: InputProps) {
  const theme = useTheme();
  const someCustomColor = theme.color.bgBase;
  return <div {...stylex.props(styles.colorPickerWrapper)} />;
}

export const App = () => <Input />;

const styles = stylex.create({
  colorPickerWrapper: {
    width: "auto",
    height: "10px",
    backgroundColor: $colors.bgBase,
    boxShadow: `0 2px 4px ${$colors.primaryColor}`,
    borderRadius: "8px",
    display: "flex",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    minWidth: "300px",
    padding: "12px",
  },
});
