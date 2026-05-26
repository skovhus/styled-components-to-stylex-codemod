// styled(X) wraps a component that exposes static subcomponents (e.g.
// `Select.Group`, `Select.Separator`). The emitted wrapper is a plain function
// that does not forward those static properties, so consumers using
// `<Wrapped.Group>` get TS2339 "Property 'Group' does not exist on type
// '(props: ...) => Element'".
//
// Regression repro for styled wrappers around compound components with
// static subcomponents.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type SelectProps = React.PropsWithChildren<{
  id?: string;
  variant?: "default" | "dense";
}>;

const SelectBase = (props: SelectProps) => <select id={props.id}>{props.children}</select>;
const SelectGroup = (props: React.PropsWithChildren<{ label?: string }>) => (
  <optgroup label={props.label}>{props.children}</optgroup>
);
const SelectOption = (props: React.PropsWithChildren<{ value: string }>) => (
  <option value={props.value}>{props.children}</option>
);
const SelectSeparator = () => <hr />;

export const Select = Object.assign(SelectBase, {
  Group: SelectGroup,
  Option: SelectOption,
  Separator: SelectSeparator,
});

function WideSelect(
  props: Omit<React.ComponentPropsWithRef<typeof Select>, "className" | "style">,
) {
  return <Select {...props} {...stylex.props(styles.wideSelect)} />;
}

WideSelect.Group = (Select as any).Group;
WideSelect.Option = (Select as any).Option;
WideSelect.Separator = (Select as any).Separator;

export const App = () => (
  <WideSelect id="x">
    <WideSelect.Separator />
    <WideSelect.Group label="favorites">
      <WideSelect.Option value="a">A</WideSelect.Option>
      <WideSelect.Option value="b">B</WideSelect.Option>
    </WideSelect.Group>
  </WideSelect>
);

const styles = stylex.create({
  wideSelect: {
    width: 200,
  },
});
