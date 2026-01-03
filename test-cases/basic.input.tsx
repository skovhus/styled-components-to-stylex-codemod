import styled from "styled-components";

/**
 * Page title with brand color styling.
 */
const Title = styled.h1`
  font-size: 1.5em;
  text-align: center;
  color: #BF4F74;
`;

// Page wrapper with padding
const Wrapper = styled.section`
  padding: 4em;
  background: papayawhip;
`;

export const App = () => (
  <Wrapper>
    <Title>Hello World!</Title>
  </Wrapper>
);
