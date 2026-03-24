// Theme method call resolution via adapter resolveThemeCall
import * as React from "react";
import styled from "styled-components";

const HighlightBox = styled.div`
  padding: 16px;
  background-color: ${(props) => props.theme.highlightVariant(props.theme.color.bgBorderSolid)};
  color: #333;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <HighlightBox>Highlight box</HighlightBox>
    </div>
  );
}
