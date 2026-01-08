import React from "react";
import styled from "styled-components";

// Bug 9: When a styled component is used as a value/reference
// (e.g., passed to another component as a prop), the codemod must
// create a wrapper function even if not exported.

interface VirtualListProps {
  outerElementType: React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;
  innerElementType: React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;
  children: React.ReactNode;
}

function VirtualList({
  outerElementType: Outer,
  innerElementType: Inner,
  children,
}: VirtualListProps) {
  return (
    <Outer>
      <Inner>{children}</Inner>
    </Outer>
  );
}

// These styled components are passed as values, not just rendered
const OuterWrapper = styled.div`
  overflow-y: auto;
  scrollbar-width: thin;
`;

const InnerWrapper = styled.div`
  position: relative;
`;

export function App() {
  return (
    <VirtualList outerElementType={OuterWrapper} innerElementType={InnerWrapper}>
      <div>Item 1</div>
      <div>Item 2</div>
    </VirtualList>
  );
}
