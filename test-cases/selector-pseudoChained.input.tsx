import * as React from "react";
import styled from "styled-components";

const Flex = (props: React.ComponentProps<"div"> & { gap?: number; shrink?: number }) => {
  const { gap, shrink, style, ...rest } = props;
  return <div {...rest} style={{ gap, flexShrink: shrink, ...style }} />;
};

// Chained pseudo-selectors with :not()
const Input = styled.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;

  &:focus:not(:disabled) {
    border-color: #bf4f74;
    outline: none;
  }

  &:hover:not(:disabled):not(:focus) {
    border-color: #999;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

// Checkbox with chained pseudos
const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;

  &:checked:not(:disabled) {
    accent-color: #bf4f74;
  }

  &:focus:not(:disabled) {
    outline: 2px solid #4f74bf;
    outline-offset: 2px;
  }
`;

// Border on :not(:last-child) with interpolation — should retain the pseudo condition
const ListItem = styled.div`
  padding: 8px;
  &:not(:last-child) {
    border-bottom: 1px solid ${(props) => props.theme.color.bgBorderSolid};
    margin-right: 5px;
  }
  &:last-child {
    color: #64748b;
  }
`;

const DialogRow = styled(Flex).attrs({ gap: 6, shrink: 0 })`
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px 0 6px;

  &:not(:last-child) {
    border-bottom: 1px solid #cbd5e1;
  }
`;

export const App = () => (
  <div>
    <Input placeholder="Focus me..." />
    <Input disabled placeholder="Disabled" />
    <Checkbox type="checkbox" />
    <Checkbox type="checkbox" disabled />
    <ListItem>Item 1</ListItem>
    <ListItem>Item 2</ListItem>
    <ListItem>Item 3 (no border)</ListItem>
    <DialogRow>Row 1</DialogRow>
    <DialogRow>Row 2</DialogRow>
  </div>
);
