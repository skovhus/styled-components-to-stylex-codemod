// @expected-warning: Unsupported selector: element selector on exported component
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
`;

export const Container = styled.div`
  padding: 16px;

  svg {
    fill: blue;
  }
`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
