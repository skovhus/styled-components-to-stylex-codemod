import React from "react";
import * as stylex from "@stylexjs/stylex";

// A component with static sub-components (like Select.Option, Select.Group)
const BaseSelect = (props: { children: React.ReactNode; className?: string }) => (
  <div className={props.className}>{props.children}</div>
);
BaseSelect.Option = (props: { children: React.ReactNode; value: string }) => (
  <div data-value={props.value}>{props.children}</div>
);
BaseSelect.Group = (props: { children: React.ReactNode; label: string }) => (
  <div data-label={props.label}>{props.children}</div>
);
BaseSelect.Separator = () => <hr />;

// Styled version that extends BaseSelect - inherits static properties
function StyledSelect(
  props: Omit<React.ComponentPropsWithRef<typeof BaseSelect>, "className" | "style">,
) {
  return <BaseSelect {...props} {...stylex.props(styles.styledSelect)} />;
}

StyledSelect.Option = (BaseSelect as any).Option;
StyledSelect.Group = (BaseSelect as any).Group;
StyledSelect.Separator = (BaseSelect as any).Separator;

export function App() {
  return (
    <StyledSelect>
      <StyledSelect.Group label="Fruits">
        <StyledSelect.Option value="apple">Apple</StyledSelect.Option>
        <StyledSelect.Option value="banana">Banana</StyledSelect.Option>
      </StyledSelect.Group>
      <StyledSelect.Separator />
      <StyledSelect.Group label="Vegetables">
        <StyledSelect.Option value="carrot">Carrot</StyledSelect.Option>
      </StyledSelect.Group>
    </StyledSelect>
  );
}

const styles = stylex.create({
  styledSelect: {
    width: "200px",
  },
});
