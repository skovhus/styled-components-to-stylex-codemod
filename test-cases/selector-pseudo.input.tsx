import styled from "styled-components";

const Thing = styled.div`
  border-right: 1px solid hotpink;
  color: blue;
  display: inline-block;
  padding: 12px;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: "🔥";
  }
`;

export const App = () => <Thing tabIndex={0}>Hover or focus me!</Thing>;
