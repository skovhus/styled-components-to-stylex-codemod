import styled, { css } from "styled-components";

export const Container = styled.div<{ size: number; padding: number }>`
  display: inline-flex;

  ${(props) => {
    return css`
      font-size: ${props.size + props.padding}px;
      line-height: ${props.size}px;
    `;
  }}
`;

export const App = () => <Container size={16} padding={4} />;
