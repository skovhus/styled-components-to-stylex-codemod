import React from "react";
import styled, { css } from "styled-components";

const Img = styled.img<{ $isInactive?: boolean; $disabled?: boolean }>`
  border-radius: 50%;
  width: 50px;
  height: 50px;

  ${(props) =>
    props.$disabled
      ? css`
          filter: opacity(0.65);
        `
      : ""}
  ${(props) =>
    props.$isInactive
      ? css`
          box-shadow: 0 0 0 1px ${props.theme.color.bgSub};
          background-color: ${props.theme.color.bgSub};
          filter: opacity(0.5) grayscale(1);
        `
      : ""};
`;

export const App = () => (
  <div>
    <Img src="https://picsum.photos/200" $disabled />
    <Img src="https://picsum.photos/200" />
    <br />
    <Img src="https://picsum.photos/200" $disabled $isInactive />
    <Img src="https://picsum.photos/200" $isInactive />
  </div>
);
