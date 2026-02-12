// @expected-warning: Unsupported interpolation: arrow function
import styled from "styled-components";

const Item = styled.div<{ $color?: string }>`
  color: blue;

  & + & {
    color: ${(props) => props.$color ?? "red"};
  }
`;

export const App = () => (
  <div>
    <Item>First</Item>
    <Item $color="green">Second</Item>
  </div>
);
