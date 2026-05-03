import styled, { css } from "styled-components";
import { Browser } from "./lib/helpers";

export const Container = styled.div<{ size: number }>`
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
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <Container size={16}>16px branch text</Container>
    <Container size={28}>28px branch text</Container>
  </div>
);
