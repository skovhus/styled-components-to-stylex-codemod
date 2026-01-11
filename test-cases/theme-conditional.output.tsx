import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

type OptionLabelProps = React.PropsWithChildren<{
  $disabled?: boolean;
}>;

function OptionLabel(props: OptionLabelProps) {
  const { children, $disabled } = props;
  return (
    <label {...stylex.props(styles.optionLabel, $disabled && styles.optionLabelDisabled)}>
      {children}
    </label>
  );
}

export const App = () => (
  <div>
    <OptionLabel>Enabled</OptionLabel>
    <OptionLabel $disabled>Disabled</OptionLabel>
  </div>
);

const styles = stylex.create({
  optionLabel: {
    display: "flex",
    gap: "4px",
    alignItems: "center",
    fontSize: "11px",
    color: themeVars.labelBase,
    cursor: "pointer",
  },
  optionLabelDisabled: {
    color: themeVars.labelMuted,
    cursor: "not-allowed",
  },
});
