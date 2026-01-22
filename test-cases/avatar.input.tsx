"use client";

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
`;

export const App = () => (
  <div>
    <Img src="https://picsum.photos/200" $disabled />
    <Img src="https://picsum.photos/200" />
  </div>
);
