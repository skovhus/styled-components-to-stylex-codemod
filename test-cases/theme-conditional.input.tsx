import * as React from "react";
import styled from "styled-components";

const OptionLabel = styled.label<{ $disabled?: boolean }>`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${(props: any) =>
    props.$disabled ? props.theme.colors.labelMuted : props.theme.colors.labelBase};
  cursor: ${(props: any) => (props.$disabled ? "not-allowed" : "pointer")};
`;

export const App = () => (
  <div>
    <OptionLabel>Enabled</OptionLabel>
    <OptionLabel $disabled>Disabled</OptionLabel>
  </div>
);
