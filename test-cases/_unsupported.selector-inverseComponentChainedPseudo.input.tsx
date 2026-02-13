// @expected-warning: Unsupported selector: unknown component selector
import styled from "styled-components";

const Parent = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  background: papayawhip;
  color: #bf4f74;
`;

const Child = styled.span`
  color: #bf4f74;

  ${Parent}:hover:focus & {
    color: rebeccapurple;
  }
`;

export const App = () => (
  <Parent>
    <Child>Hover and focus parent</Child>
  </Parent>
);
