// Inline style object with multiple properties sharing the same ternary condition.
// Should hoist into a static base style + boolean-conditional variant style instead
// of emitting a single dynamic function with N ternary call args.
import * as React from "react";
import styled from "styled-components";

const Input = styled.input`
  font-size: 14px;
  border: 1px solid #ccc;
  padding: 4px 8px;
`;

const InputRow = ({ hasRange }: { hasRange: boolean }) => (
  <Input
    style={{
      width: hasRange ? 48 : "100%",
      cursor: hasRange ? "text" : "ew-resize",
      textAlign: hasRange ? "right" : "left",
    }}
    defaultValue={hasRange ? "hasRange" : "no range"}
  />
);

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <InputRow hasRange={true} />
    <InputRow hasRange={false} />
  </div>
);
