import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

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
function StyledSelect(props: Omit<React.ComponentPropsWithRef<typeof BaseSelect>, "style">) {
  const { className, children, ...rest } = props;

  return (
    <BaseSelect {...rest} {...mergedSx(styles.select, className)}>
      {children}
    </BaseSelect>
  );
}

StyledSelect.Option = (BaseSelect as any).Option;
StyledSelect.Group = (BaseSelect as any).Group;
StyledSelect.Separator = (BaseSelect as any).Separator;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Default</strong>
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
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Favorites</strong>
        <StyledSelect>
          <StyledSelect.Group label="Top picks">
            <StyledSelect.Option value="mango">Mango</StyledSelect.Option>
            <StyledSelect.Option value="broccoli">Broccoli</StyledSelect.Option>
          </StyledSelect.Group>
          <StyledSelect.Separator />
          <StyledSelect.Option value="water">Water</StyledSelect.Option>
        </StyledSelect>
      </div>
    </div>
  );
}

const styles = stylex.create({
  select: {
    width: 240,
    minHeight: 140,
    paddingBlock: 12,
    paddingInline: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#2f2f2f",
    borderRadius: 8,
    backgroundColor: "#f6f7fb",
    color: "#1c1c1c",
  },
});
