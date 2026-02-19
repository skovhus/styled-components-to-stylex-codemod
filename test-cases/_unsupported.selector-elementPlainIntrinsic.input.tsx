// @expected-warning: Unsupported selector: element selector with plain intrinsic children
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
  width: 24px;
  height: 24px;
`;

// Parent renders both <Icon /> (styled) and a plain <svg>.
// `svg { ... }` would only be applied as an override on Icon, losing
// styling for the plain <svg> element.
const Container = styled.div`
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
    <svg viewBox="0 0 24 24">
      <rect width="10" height="10" />
    </svg>
  </Container>
);
