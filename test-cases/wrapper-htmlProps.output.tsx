import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type OptionLabelProps = { disabled?: boolean } & Pick<
  React.ComponentProps<"label">,
  "children" | "onClick" | "title"
>;

// When a styled component wrapper spreads ...rest to the element,
// the wrapper type should include HTML element props like title, onClick, etc.

function OptionLabel(props: OptionLabelProps) {
  const { children, disabled, ...rest } = props;

  return (
    <label {...rest} sx={[styles.optionLabel, disabled ? styles.optionLabelDisabled : undefined]}>
      {children}
    </label>
  );
}

export const App = () => (
  <div>
    {/* title and onClick should be valid props */}
    <OptionLabel title="This is a tooltip" disabled={false} onClick={() => console.log("clicked")}>
      <input type="checkbox" />
      Option 1
    </OptionLabel>
    <OptionLabel disabled={true} title="Disabled option">
      <input type="checkbox" disabled />
      Option 2
    </OptionLabel>
  </div>
);

const styles = stylex.create({
  optionLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    opacity: 1,
  },
  optionLabelDisabled: {
    opacity: 0.5,
  },
});
