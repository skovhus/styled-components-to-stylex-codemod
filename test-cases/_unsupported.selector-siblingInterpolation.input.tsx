// @expected-warning: Unsupported interpolation: arrow function
import styled from "styled-components";

const Item = styled.div<{ $color?: string }>`
  color: blue;

  &.anchor ~ & {
    color: ${(props) => props.$color ?? "red"};
  }
`;

export const App = () => (
  <div>
    <Item className="anchor">First</Item>
    <Item $color="green">Second</Item>
  </div>
);
