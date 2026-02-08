import React from "react";
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
  width: 240px;
  min-height: 140px;
  padding-block: 12px;
  padding-inline: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid #2f2f2f;
  border-radius: 8px;
  background-color: #f6f7fb;
  color: #1c1c1c;
`;

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
