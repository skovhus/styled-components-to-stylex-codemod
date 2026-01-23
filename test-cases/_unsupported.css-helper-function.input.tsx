import * as React from "react";
import styled, { css } from "styled-components";

// css helper inside a regular function cannot be statically transformed

type Appearance = "normal" | "small" | "medium" | "large" | "xlarge";

const inputStyles = (appearance: Appearance) => css`
  -webkit-app-region: no-drag;
  background: hotpink;
  width: 30px;
  padding: 10px;

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
          height: 30px;
        `;
      }
    }
  }}
`;

const StyleBox = styled.div<{ appearance: Appearance }>`
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
