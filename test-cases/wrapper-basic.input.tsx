import * as React from "react";
import styled from "styled-components";

/**
 * A component
 */
export function SomeComponent() {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  return (
    <Wrapper ref={outerRef} tabIndex={-1}>
      <div ref={innerRef} style={{ height: 200 }}>
        Scrollable content
      </div>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  /* Constrained height to show scroll */
  height: 60px;
  /* Fixed width */
  width: 160px;
  overflow-y: scroll; // This is important
  background-color: #f0f4f8;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <SomeComponent />
  </div>
);
