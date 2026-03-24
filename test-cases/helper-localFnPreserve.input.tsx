// Local function preserved as runtime call when used with theme args
import * as React from "react";
import styled from "styled-components";

function caret(color: string): string {
  return `inset 0 -2px 0 ${color}`;
}

const CaretBox = styled.div`
  padding: 16px;
  background-color: #f5f5f5;
  box-shadow: ${(props) => caret(props.theme.color.labelMuted)};
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <CaretBox>Caret box</CaretBox>
    </div>
  );
}
