import React from "react";
import styled from "styled-components";

/**
 * Test case for styled.input with externalInterface: style: true (without .attrs)
 *
 * Key issues to test:
 * 1. Rest props should be forwarded to the input element
 * 2. The "as" prop should be allowed (for polymorphism)
 * 3. External styles (className, style) should be supported
 */
export const StyledInput = styled.input`
  transition-property: color;
  border: 1px solid blue;
`;

// Usage: should pass through all input props
export const App = () => (
  <>
    <StyledInput placeholder="Type here" value="hello" onChange={() => {}} />
    <StyledInput as="textarea" placeholder="Textarea mode" />
    {/* Children should be forwarded when using as prop with non-void element */}
    <StyledInput as="button">Click me</StyledInput>
  </>
);
