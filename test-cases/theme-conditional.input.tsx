import * as React from "react";
import styled from "styled-components";

const OptionLabel = styled.label<{ $disabled?: boolean }>`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${(props: any) =>
    props.$disabled ? props.theme.color.labelMuted : props.theme.color.labelBase};
  cursor: ${(props: any) => (props.$disabled ? "not-allowed" : "pointer")};
`;

// Prop-based conditional with theme access in template literal (border shorthand)
const HighlightBox = styled.div<{ $isHighlighted?: boolean }>`
  padding: 12px;
  background-color: ${(props: any) => props.theme.color.bgBase};
  border-left: ${(props: any) =>
    props.$isHighlighted ? `2px solid ${props.theme.color.greenBase}` : "2px solid transparent"};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
    <OptionLabel>Enabled</OptionLabel>
    <OptionLabel $disabled>Disabled</OptionLabel>
    <HighlightBox>Default box</HighlightBox>
    <HighlightBox $isHighlighted>Highlighted box</HighlightBox>
  </div>
);
