import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
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

  return <ColorPickerWrapper style={{ backgroundColor: someCustomColor }} />;
}

function ColorPickerWrapper(
  props: React.PropsWithChildren<{
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { children, style } = props;

  return <div {...mergedSx(styles.colorPickerWrapper, undefined, style)}>{children}</div>;
}

export const App = () => <Input />;

const styles = stylex.create({
  colorPickerWrapper: {
    width: "auto",
    height: "10px",
    backgroundColor: $colors.bgBase,
    backgroundImage: $colors.bgBase,
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
