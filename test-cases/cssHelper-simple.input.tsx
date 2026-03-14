import styled, { css } from "styled-components";
import { Browser } from "./lib/helpers";

export const Container = styled.div<{ size: number; padding: number }>`
  display: inline-flex;

  ${(props) => {
    return css`
      font-size: ${props.size + props.padding}px;
      line-height: ${props.size}px;
    `;
  }}
`;

// css helper called from a function with if/else branches
export const BranchedContainer = styled.div<{ size: number }>`
  display: inline-flex;

  ${(props) => {
    if (Browser.isSafari) {
      return css`
        font-size: ${props.size - 4}px;
        line-height: 1;
      `;
    }

    return css`
      font-size: ${props.size - 3}px;
      line-height: ${props.size}px;
    `;
  }}
`;

export const App = () => (
  <div>
    <Container size={16} padding={4}>
      Hello World
    </Container>
    <BranchedContainer size={16}>Branched</BranchedContainer>
  </div>
);
