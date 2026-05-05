/**
 * Test case for element child combinator selectors.
 * Demonstrates `> button { ... }` being transformed to direct-child-only
 * relation overrides.
 */
import * as React from "react";
import styled from "styled-components";

const ActionButton = styled.button`
  padding: 8px 16px;
  background: #bf4f74;
  color: white;
  border: none;
  border-radius: 4px;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px;
  background: #f0f0f0;

  > button {
    font-weight: bold;
  }
`;

const MixedToolbar = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px;
  background: #eef7ff;

  button {
    text-decoration: underline;
  }

  > button {
    font-weight: bold;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Toolbar>
      <ActionButton>Action 1</ActionButton>
      <ActionButton>Action 2</ActionButton>
    </Toolbar>
    <MixedToolbar>
      <ActionButton>Direct mixed</ActionButton>
      <span>
        <ActionButton>Nested mixed</ActionButton>
      </span>
    </MixedToolbar>
  </div>
);
