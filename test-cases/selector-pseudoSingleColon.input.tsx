import React from "react";
import styled from "styled-components";

/**
 * Pseudo-elements with single colon (&:before, &:after).
 * The codemod should normalize to double-colon (::before / ::after).
 */
const Point = styled.div`
  position: relative;
  width: 48px;
  height: 16px;
  background-color: #bf4f74;
  border-radius: 2px;
  &:before,
  &:after {
    content: "";
    position: absolute;
    left: 0;
    height: 8px;
    width: 48px;
    background-color: rgba(191, 79, 116, 0.5);
    z-index: 1;
  }
  &:before {
    top: -12px;
  }
  &:after {
    bottom: -12px;
  }
`;

export const App = () => (
  <div style={{ padding: 40 }}>
    <Point>Point</Point>
  </div>
);
