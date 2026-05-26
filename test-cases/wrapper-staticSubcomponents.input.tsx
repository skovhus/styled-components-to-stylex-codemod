// styled(X) wraps a component that exposes static subcomponents (e.g.
// `Select.Group`, `Select.Separator`). The emitted wrapper is a plain function
// that does not forward those static properties, so consumers using
// `<Wrapped.Group>` get TS2339 "Property 'Group' does not exist on type
// '(props: ...) => Element'".
//
// Regression repro for styled wrappers around compound components with
// static subcomponents.
import * as React from "react";
import styled from "styled-components";

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

const selectOptionStatics = {
  Option: SelectOption,
  "sub-component": SelectSeparator,
};

export const Select = Object.assign(
  SelectBase,
  {
    Group: SelectGroup,
  },
  selectOptionStatics,
  {
    Separator: SelectSeparator,
  },
);

const WideSelect = styled(Select)`
  width: 200px;
`;

const BaseWideSelect = styled(SelectBase)`
  width: 240px;
`;

export const App = () => (
  <>
    <WideSelect id="x">
      <WideSelect.Separator />
      <WideSelect.Group label="favorites">
        <WideSelect.Option value="a">A</WideSelect.Option>
        <WideSelect.Option value="b">B</WideSelect.Option>
      </WideSelect.Group>
    </WideSelect>
    <BaseWideSelect id="y">Base wrapper</BaseWideSelect>
  </>
);
