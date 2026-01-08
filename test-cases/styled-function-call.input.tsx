import React from "react";
import styled from "styled-components";

// Bug 3a: styled("tagName") function call syntax should transform
// the same as styled.tagName - both are valid styled-components syntax.

const Input = styled("input")`
  height: 32px;
  padding: 8px;
  background: white;
  border: 1px solid #ccc;
`;

const Button = styled("button")`
  background: blue;
  color: white;
`;

export function App() {
  return (
    <div>
      <Input placeholder="Type here" />
      <Button>Submit</Button>
    </div>
  );
}
