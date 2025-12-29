import styled from "styled-components";

const Thing = styled.div`
  color: blue;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: '🔥';
  }
`;

export const App = () => <Thing>Hover me!</Thing>;
