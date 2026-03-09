// Stripping "Styled" prefix from component names when generating StyleX keys
import * as React from "react";
import styled from "styled-components";

const StyledCanvas = styled.canvas`
  border: 1px solid black;
  width: 200px;
  height: 100px;
`;

const StyledSection = styled.section`
  padding: 16px;
  background-color: #f0f0f0;
`;

const NormalName = styled.div`
  color: blue;
  padding: 8px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <StyledCanvas />
    <StyledSection>Styled Section</StyledSection>
    <NormalName>Normal name (no prefix)</NormalName>
  </div>
);
