import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
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
  const someCustomColor = theme.color.bgBase;
  return <ColorPickerWrapper style={{ backgroundColor: someCustomColor }} />;
}

type ColorPickerWrapperProps = React.PropsWithChildren<{
  style?: React.CSSProperties;
}>;

function ColorPickerWrapper(props: ColorPickerWrapperProps) {
  const { children, style } = props;
  return <div {...mergedSx(styles.colorPickerWrapper, undefined, style)}>{children}</div>;
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
