/**
 * Test case for element selectors with child pseudo-classes.
 * Demonstrates `svg:hover { ... }` being transformed to
 * a pseudo-class on the child element (not stylex.when.ancestor()).
 */
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg`
  fill: gray;
  width: 24px;
  height: 24px;
`;

const Container = styled.div`
  padding: 16px;
  background: white;

  svg:hover {
    fill: blue;
    transform: scale(1.2);
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Container>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
      <span>Hover the icon</span>
    </Container>
  </div>
);
