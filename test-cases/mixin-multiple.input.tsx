import styled, { css } from "styled-components";

const ColorMixin = css`
  color: red;
`;

const BackgroundMixin = css`
  background: blue;
`;

const Container = styled.div`
  ${ColorMixin}
  ${BackgroundMixin}
  padding: 10px;
`;

export const App = () => <Container>Multiple mixins</Container>;
