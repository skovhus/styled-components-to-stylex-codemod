// Pseudo-class and media query on the same property
import styled from "styled-components";

const Box = styled.div`
  color: blue;
  background-color: white;

  &:hover {
    color: red;
    background-color: lightblue;
  }

  &:focus-visible {
    color: green;
    outline: 2px solid blue;
  }

  @media (max-width: 600px) {
    color: orange;
    background-color: gray;
  }
`;

export const App = () => <Box>Hover or focus me, and resize!</Box>;
