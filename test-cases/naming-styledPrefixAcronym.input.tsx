// StyledSVG prefix stripping should produce "svg" style key, not "sVG"
import * as React from "react";
import styled from "styled-components";

const StyledSVG = styled.svg`
  align-self: center;
  flex-shrink: 0;
`;

const StyledURL = styled.div`
  color: blue;
  text-decoration: underline;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: "12px", padding: "16px" }}>
      <StyledSVG aria-hidden width={14} height={14}>
        <rect width="14" height="14" fill="coral" />
      </StyledSVG>
      <StyledURL>https://example.com</StyledURL>
    </div>
  );
}
