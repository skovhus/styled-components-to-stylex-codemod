import React from "react";
import styled from "styled-components";

// Styled hr
const Divider = styled.hr<{ $color?: string }>`
  border: none;
  height: 1px;
  background: ${(props) => props.$color ?? "#e0e0e0"};
  margin: 16px 0;
`;

export const App = () => (
  <div>
    <Divider />
    <Divider $color="#bf4f74" />
  </div>
);
