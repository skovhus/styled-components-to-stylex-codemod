// @expected-warning: Unsupported selector: element selector on exported component
import styled from "styled-components";

export const Trigger = styled.div`
  & > button[disabled] {
    pointer-events: none;
  }
`;

export const App = () => (
  <Trigger>
    <button disabled>Click me</button>
  </Trigger>
);
