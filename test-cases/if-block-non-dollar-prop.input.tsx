// Test case: Using non-$-prefixed props (like props.myProp) in browser conditional
// if-blocks. These should be properly parameterized in the generated StyleX code.
import styled, { css } from "styled-components";
import { Browser } from "./lib/helpers";

// The codemod should transform props.myProp to a parameter in the StyleX style function.
export const Container = styled.div<{ myProp: number }>`
  display: inline-flex;

  ${(props) => {
    if (Browser.isSafari) {
      return css`
        font-size: ${props.myProp - 4}px;
        line-height: 1;
      `;
    }

    return css`
      font-size: ${props.myProp - 3}px;
    `;
  }}
`;

export const App = () => <Container myProp={16} />;
