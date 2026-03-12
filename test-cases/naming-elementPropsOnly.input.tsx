// Consumer passes element props (onClick) but no spread - tests P1 fix for ?? vs || operator
import * as React from "react";
import styled from "styled-components";

export const ClickableBox = styled.div`
  background-color: lightblue;
  padding: 16px;
  cursor: pointer;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <ClickableBox onClick={() => alert("clicked")}>Click me</ClickableBox>
  </div>
);
