/**
 * Test case for element descendant selectors.
 * Demonstrates `svg { ... }` being transformed to relation overrides
 * when a single styled.svg exists in the same file.
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

  svg {
    fill: blue;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Container>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
      <span>With icon</span>
    </Container>
  </div>
);
