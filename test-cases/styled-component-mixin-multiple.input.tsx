import styled from "styled-components";

const ColorMixin = styled.div`
  color: red;
`;

const BackgroundMixin = styled.div`
  background: blue;
`;

const Container = styled.div`
  ${ColorMixin}
  ${BackgroundMixin}
  padding: 10px;
`;

export const App = () => <Container>Multiple mixins</Container>;
