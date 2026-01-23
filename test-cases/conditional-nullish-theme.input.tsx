import React from "react";
import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

const Line = styled.div<{ $isRemoval?: boolean; $deletionColor?: string }>`
  height: ${thinPixel()};
  background: ${(props) =>
    props.$isRemoval
      ? (props.$deletionColor ?? props.theme.color.bgBase)
      : props.theme.color.bgSub};
  margin: 10px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
    <Line />
    <Line $isRemoval />
    <Line $isRemoval $deletionColor="#ff0000" />
  </div>
);
