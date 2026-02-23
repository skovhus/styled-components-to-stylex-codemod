import styled from "styled-components";
import { SecondLink, SecondLinkGlobalSelector } from "./lib/converted-multi-export";

const Container = styled.div`
  padding: 16px;

  ${SecondLinkGlobalSelector} {
    color: red;
  }
`;

export const App = () => (
  <Container>
    <SecondLink href="#">Link</SecondLink>
  </Container>
);
