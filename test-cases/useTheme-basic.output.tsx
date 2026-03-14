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

  return <div sx={styles.colorPickerWrapper(someCustomColor)} />;
}

export const App = () => (
  <div>
    <Input />
    <div sx={styles.fallbackBox}>Fallback test</div>
  </div>
);

const styles = stylex.create({
  colorPickerWrapper: (backgroundColor: string) => ({
    width: "auto",
    height: 10,
    boxShadow: `0 2px 4px ${$colors.primaryColor}`,
    borderRadius: 8,
    display: "flex",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    minWidth: 300,
    padding: 12,
    backgroundColor,
  }),
  // Nullish coalescing fallback on theme color
  fallbackBox: {
    color: $colors.labelBase,
  },
});
