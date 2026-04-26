/**
 * Test case for same-file element descendant selectors with both styled and plain intrinsic children.
 * Demonstrates `svg { ... }` being applied callsite-locally to every statically provable matching child.
 */
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
  width: 24px;
  height: 24px;
`;

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
