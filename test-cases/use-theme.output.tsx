import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

type InputProps = {
  /** id for accessibility focus from label */
  id?: string;
};

/**
 * Color input, in the form of a clickable square that opens up a color picker
 */
export function Input(props: InputProps) {
  const theme = useTheme();
  const someCustomColor = theme.colors.bgBase;
  return (
    <div
      {...stylex.props(styles.colorPickerWrapper)}
      style={{ backgroundColor: someCustomColor }}
    />
  );
}

export const App = () => <Input />;

const styles = stylex.create({
  colorPickerWrapper: {
    width: "auto",
    height: "10px",
    backgroundColor: themeVars.bgBase,
    boxShadow: `0 2px 4px ${themeVars.primaryColor}`,
    borderRadius: "8px",
    display: "flex",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: themeVars.bgSub,
    minWidth: "300px",
    padding: "12px",
  },
});
