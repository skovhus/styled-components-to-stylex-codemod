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
      <div ref={innerRef} />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  /* A height of 0 */
  height: 0;
  /* Fixed width */
  width: 50px;
  overflow-y: scroll; // This is important
`;

export const App = () => <SomeComponent />;
