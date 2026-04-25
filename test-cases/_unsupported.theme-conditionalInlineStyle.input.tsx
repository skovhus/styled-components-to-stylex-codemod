// @expected-warning: CSS custom property declarations are not supported in StyleX
import * as React from "react";
import styled from "styled-components";

export const Chip = styled.div`
  padding: 8px 16px;
  background-color: ${(props: any) =>
    props.theme.isDark
      ? props.theme.highlightVariant(props.theme.color.bgFocus)
      : props.theme.color.bgFocus};
`;

// CSS custom property with one unresolvable theme member expression branch
const DayPicker = styled.div`
  --highlighted-color: ${(p) =>
    p.theme.isDark ? p.theme.baseTheme?.color.bgBorderSolid : p.theme.color.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Chip>Default</Chip>
    <DayPicker>DayPicker</DayPicker>
  </div>
);
