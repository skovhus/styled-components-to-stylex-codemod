// Repro: ensure base styles are preserved when component selector fallback runs
import styled from "styled-components";

const Child = styled.div`
  color: red;
`;

const Parent = styled.div`
  width: 123px;
  height: 45px;
  opacity: 0.8;
  transform: scale(1);

  ${Child} {
    color: blue;
  }
`;

export function App() {
  return (
    <Parent>
      <Child>child</Child>
    </Parent>
  );
}
