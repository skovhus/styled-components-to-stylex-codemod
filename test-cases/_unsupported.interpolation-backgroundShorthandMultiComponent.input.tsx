// @expected-warning: Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand
// Multi-component background shorthands with multiple runtime slots cannot be collapsed into one StyleX longhand.
import styled from "styled-components";

const Card = styled.div<{ $src: string; $position: string }>`
  background: url(${(props) => props.$src}) ${(props) => props.$position};
  width: 160px;
  height: 80px;
  color: white;
  padding: 12px;
`;

export const App = () => (
  <Card $src="/texture.png" $position="center">
    Dynamic shorthand
  </Card>
);
