/**
 * Test case for element selectors with ancestor pseudo-classes.
 * Demonstrates `&:hover svg { ... }` being transformed to
 * stylex.when.ancestor(":hover") on the child element.
 */
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
  width: 24px;
  height: 24px;
`;

const Card = styled.div`
  padding: 16px;
  background: white;
  border: 1px solid #ccc;

  &:hover svg {
    fill: red;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Card>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
      <span>Hover me</span>
    </Card>
  </div>
);
