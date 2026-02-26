// Multi-statement if/return chain in a property-value interpolation
import * as React from "react";
import styled from "styled-components";

const FlexContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !["column", "reverse"].includes(prop),
})<{ column?: boolean; reverse?: boolean }>`
  display: flex;
  flex-direction: ${({ column, reverse }) => {
    if (column) {
      return reverse ? "column-reverse" : "column";
    }
    return reverse ? "row-reverse" : "row";
  }};
  gap: 8px;
  padding: 16px;
  background-color: #f0f0f0;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <FlexContainer>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Row</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Default</div>
    </FlexContainer>
    <FlexContainer column>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Column</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Down</div>
    </FlexContainer>
    <FlexContainer reverse>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Row</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Reverse</div>
    </FlexContainer>
    <FlexContainer column reverse>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Column</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Reverse</div>
    </FlexContainer>
  </div>
);
