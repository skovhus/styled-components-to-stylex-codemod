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

type HighlightBoxProps = React.PropsWithChildren<{
  isHighlighted?: boolean;
}>;

// Prop-based conditional with theme access in template literal (border shorthand)
function HighlightBox(props: HighlightBoxProps) {
  const { children, isHighlighted } = props;

  return (
    <div sx={[styles.highlightBox, isHighlighted && styles.highlightBoxHighlighted]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
    <OptionLabel>Enabled</OptionLabel>
    <OptionLabel disabled>Disabled</OptionLabel>
    <HighlightBox>Default box</HighlightBox>
    <HighlightBox isHighlighted>Highlighted box</HighlightBox>
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
  highlightBox: {
    padding: 12,
    backgroundColor: $colors.bgBase,
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  },
  highlightBoxHighlighted: {
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: $colors.greenBase,
  },
});
