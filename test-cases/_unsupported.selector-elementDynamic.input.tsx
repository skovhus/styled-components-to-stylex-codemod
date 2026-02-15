// @expected-warning: Unsupported selector: element selector with dynamic children
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
`;

const Container = styled.div`
  padding: 16px;

  svg {
    fill: blue;
  }
`;

export const App = ({ children }: { children: React.ReactNode }) => (
  <Container>{children}</Container>
);
