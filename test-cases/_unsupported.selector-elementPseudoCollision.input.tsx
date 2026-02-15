// @expected-warning: Unsupported selector: element selector pseudo collision
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
  width: 24px;
  height: 24px;
`;

// Same pseudo (:hover) used in both ancestor and child contexts:
// `&:hover svg { fill: red }` → ancestor pseudo
// `svg:hover { fill: blue }` → child pseudo
// The pseudo bucket key collides, causing misattribution.
const Container = styled.div`
  padding: 16px;

  &:hover svg {
    fill: red;
  }

  svg:hover {
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
