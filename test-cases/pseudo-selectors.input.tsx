import styled from "styled-components";

const Thing = styled.div`
  border-right: 1px solid hotpink;
  color: blue;

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

export const App = () => <Thing>Hover me!</Thing>;
