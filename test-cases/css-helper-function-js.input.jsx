import React from "react";
import styled, { css } from "styled-components";

const inputStyles = (appearance) => css`
  background: hotpink;
  width: 30px;
  margin: 10px;

  ${() => {
    switch (appearance) {
      case "small":
      case "medium": {
        return css`
          height: 10px;
        `;
      }
      case "large":
      case "xlarge": {
        return css`
          height: 20px;
        `;
      }
      default: {
        return css`
          height: 50px;
        `;
      }
    }
  }}
`;

const StyleBox = styled.div`
  ${(props) => inputStyles(props.appearance)};
`;

export const App = () => (
  <div>
    <StyleBox appearance="normal" />
    <StyleBox appearance="small" />
    <StyleBox appearance="medium" />
    <StyleBox appearance="large" />
    <StyleBox appearance="xlarge" />
  </div>
);
