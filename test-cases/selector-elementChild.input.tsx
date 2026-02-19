/**
 * Test case for element child combinator selectors.
 * Demonstrates `> button { ... }` being transformed to relation overrides.
 *
 * Note: Both CSS descendant (space) and child (>) combinators map to
 * stylex.when.ancestor(). The child combinator is therefore less strict
 * in the output than the original CSS.
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

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Toolbar>
      <ActionButton>Action 1</ActionButton>
      <ActionButton>Action 2</ActionButton>
    </Toolbar>
  </div>
);
