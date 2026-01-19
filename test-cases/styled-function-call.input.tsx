import React from "react";
import styled from "styled-components";
import { animated } from "./lib/react-spring";

// Bug 3a: styled(Component) function call syntax should transform properly.
// This includes both styled("tagName") and styled(ImportedComponent).

// Pattern 1: styled("tagName") - string tag name
const Input = styled("input")`
  height: 32px;
  padding: 8px;
  background: white;
  border: 1px solid #ccc;
`;

// Pattern 2: styled(Component) - imported component (e.g., from react-spring)
const AnimatedBox = styled(animated.div)`
  padding: 16px;
  background: blue;
  color: white;
  border: 1px solid ${(props) => props.theme.color.primaryColor};
`;

export function App() {
  return (
    <div>
      <Input placeholder="Type here" />
      <AnimatedBox>Animated content</AnimatedBox>
    </div>
  );
}
