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

// Collision case: Button and StyledButton both exist.
// StyledButton must NOT strip to "button" since Button already has that key.
const Button = styled.button`
  background-color: coral;
  padding: 8px 16px;
  color: white;
`;

const StyledButton = styled.button`
  background-color: teal;
  padding: 12px 24px;
  color: white;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <StyledCanvas />
    <StyledSection>Styled Section</StyledSection>
    <NormalName>Normal name (no prefix)</NormalName>
    <Button>Button (coral)</Button>
    <StyledButton>StyledButton (teal)</StyledButton>
  </div>
);
