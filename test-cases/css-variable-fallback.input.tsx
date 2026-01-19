import React from "react";
import styled from "styled-components";

/**
 * Test case for CSS variable with fallback value.
 * The codemod should handle: var(--scrollbar-width, 12px)
 */
const ScrollContainer = styled.div`
  width: 100%;
  padding-right: var(--scrollbar-width, 12px);
  overflow-y: auto;
`;

export function ScrollableArea({ children }: { children: React.ReactNode }) {
  return <ScrollContainer>{children}</ScrollContainer>;
}

export const App = () => (
  <ScrollableArea>
    <div>Scrollable content</div>
  </ScrollableArea>
);
