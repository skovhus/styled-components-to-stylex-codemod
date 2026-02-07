import * as React from "react";
import styled from "styled-components";

export const Chip = styled.div`
  padding: 8px 16px;
  background-color: ${(props: any) =>
    props.theme.isDark
      ? props.theme.highlightVariant(props.theme.color.bgFocus)
      : props.theme.color.bgFocus};
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Chip>Default</Chip>
  </div>
);
