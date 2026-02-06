// @expected-warning: Static properties on styled components (e.g. Styled.Component) are not supported
import * as React from "react";
import styled from "styled-components";

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
const StyledSelect = styled(BaseSelect)`
  width: 200px;
`;

export function SelectExample() {
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
