// Boolean ternary on a wrapper component should merge into a single ternary
import * as React from "react";
import styled from "styled-components";

function BaseBox(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

const StyledBox = styled(BaseBox)<{ $inline?: boolean }>`
  color: red;
  ${(props) =>
    props.$inline === true
      ? `padding: 0 6px;
         border-radius: 4px;
         position: absolute;`
      : `margin-top: 8px;`}
`;

export function App() {
  return (
    <div style={{ padding: "16px", position: "relative" }}>
      <StyledBox $inline>Inline</StyledBox>
      <StyledBox>Block</StyledBox>
    </div>
  );
}
