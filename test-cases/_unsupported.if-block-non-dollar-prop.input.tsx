// @expected-warning: Arrow function: body is not a recognized pattern (expected ternary, logical, call, or member expression)
// Test case: Using non-$-prefixed props (like props.theme or props.myProp)
// in browser conditional if-blocks should cause the codemod to bail,
// as these would create unbound variable references in the generated StyleX code.
import styled, { css } from "styled-components";
import { Browser } from "./lib/helpers";

// This should NOT be transformed because props.myProp would remain in the
// generated style function body, but wouldn't be passed as a parameter.
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
