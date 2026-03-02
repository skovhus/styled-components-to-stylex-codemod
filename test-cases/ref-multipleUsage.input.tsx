// Ref usage across multiple callsites should not force wrapper emission.
import * as React from "react";
import styled from "styled-components";

const Card = styled.div`
  padding: 8px;
  border: 1px solid #ccc;
  background: #f8f8f8;
`;

export function App() {
  const firstRef = React.useRef<HTMLDivElement>(null);
  const secondRef = React.useRef<HTMLDivElement>(null);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Card ref={firstRef}>First card</Card>
      <Card ref={secondRef}>Second card</Card>
    </div>
  );
}
