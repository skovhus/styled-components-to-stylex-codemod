import styled, { css } from "styled-components";

export const Container = styled.div<{ $size: number }>`
  display: inline-flex;

  ${(props) => {
    return css`
      font-size: ${props.$size - 3}px;
      line-height: ${props.$size}px;
    `;
  }}
`;

export const App = () => <Container $size={16} />;
