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

const RuntimeOffset = styled.div`
  position: relative;
  top: ${Browser.isTouchDevice ? 5 : 1}px;
  left: ${Browser.isTouchDevice && !Browser.isSafari ? -5 : -40}px;
  margin: ${Browser.isTouchDevice ? 4 : 8}px 12px;
  padding: ${Browser.isTouchDevice ? 4 : 8}px !important;
  background-color: peachpuff;
`;

export const App = () => (
  <div>
    <Container size={16} padding={4}>
      Hello World
    </Container>
    <BranchedContainer size={16}>Branched</BranchedContainer>
    <RuntimeOffset>Runtime touch offset</RuntimeOffset>
  </div>
);
