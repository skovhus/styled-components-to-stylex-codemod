import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type OptionLabelProps = React.PropsWithChildren<{
  disabled?: boolean;
}>;

function OptionLabel(props: OptionLabelProps) {
  const { children, disabled } = props;

  return (
    <label sx={[styles.optionLabel, disabled && styles.optionLabelDisabled]}>{children}</label>
  );
}

export const App = () => (
  <div>
    <OptionLabel>Enabled</OptionLabel>
    <OptionLabel disabled>Disabled</OptionLabel>
  </div>
);

const styles = stylex.create({
  optionLabel: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    fontSize: 11,
    color: $colors.labelBase,
    cursor: "pointer",
  },
  optionLabelDisabled: {
    color: $colors.labelMuted,
    cursor: "not-allowed",
  },
});
