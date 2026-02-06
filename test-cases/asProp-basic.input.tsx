import * as React from "react";
import styled from "styled-components";
import { Text } from "./lib/text";

// Pattern 1: styled.element with as prop at call site
const Button = styled.button`
  display: inline-block;
  color: #BF4F74;
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border: 2px solid #BF4F74;
  border-radius: 3px;
`;

// Pattern 2: styled(Component) where Component has custom props (like variant)
// When used with as="label", the component's props must be preserved
const StyledText = styled(Text)`
  margin-top: 4px;
`;

export const App = () => (
  <div>
    <Button>Normal Button</Button>
    <Button as="a" href="#">
      Link with Button styles
    </Button>
    {/* Pattern 2: styled(Component) with as prop */}
    <StyledText variant="small" color="muted">
      Normal styled text
    </StyledText>
    {/* Pattern 3: as="label" with label-specific props like htmlFor */}
    <StyledText variant="mini" as="label" htmlFor="my-input">
      Label using Text styles
    </StyledText>
  </div>
);
