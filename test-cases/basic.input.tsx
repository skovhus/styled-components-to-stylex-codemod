import React from "react";
import styled from "styled-components";

/**
 * Page title with brand color styling.
 */
const Title = styled.h1`
  font-size: 1.5em;
  text-align: center;
  color: #bf4f74;
`;

// Page wrapper with padding
const Wrapper = styled.section`
  padding: 4em;
  background: papayawhip;
`;

export const Select = styled.select`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
`;

export const App = () => (
  <Wrapper>
    <Title>Hello World!</Title>
    <Select onChange={(e) => console.log(e.target.value)} />
  </Wrapper>
);
