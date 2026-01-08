import * as React from "react";
import styled from "styled-components";

// Bug 2: When codemod generates wrapper functions, it must include
// proper type annotations for all parameters to avoid implicit 'any'.

interface BoxProps {
  /** Whether the box has a border */
  bordered?: boolean;
  /** Background color override */
  bg?: string;
}

// Component with props that affect styles
export const Box = styled.div<BoxProps>`
  padding: 16px;
  border: ${(props) => (props.bordered ? "1px solid gray" : "none")};
  background-color: ${(props) => props.bg || "white"};
`;

// Component with callback that receives event
export const Input = styled.input`
  padding: 8px;
  &:focus {
    outline: 2px solid blue;
  }
`;

export function Form() {
  return (
    <Box bordered bg="lightgray">
      <Input onChange={(e) => console.log(e.target.value)} />
    </Box>
  );
}

export function App() {
  return <Form />;
}
