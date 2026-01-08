import * as React from "react";
import styled from "styled-components";

// Bug 12: When codemod generates wrapper function, the props type must include
// standard HTML attributes (className, children, style) that the wrapper uses.
// Otherwise: "Property 'className' does not exist on type 'MyProps'"

// Pattern 1: styled("span") with custom props - wrapper needs span attributes
interface TextColorProps {
  /** Custom color prop */
  color: string;
}

export const TextColor = styled("span")<TextColorProps>`
  color: ${(props) => props.color};
`;

// Pattern 2: styled(Component) - wrapper needs component's props + HTML attributes
const BaseText = (props: React.ComponentProps<"span">) => <span {...props} />;

interface HighlightProps {
  /** Whether to highlight */
  highlighted?: boolean;
}

export const Highlight = styled(BaseText)<HighlightProps>`
  background: ${(props) => (props.highlighted ? "yellow" : "transparent")};
`;

export function App() {
  return (
    <>
      <TextColor color="red" className="custom" style={{ fontSize: 14 }}>
        Red text
      </TextColor>
      <Highlight highlighted className="highlight">
        Highlighted text
      </Highlight>
    </>
  );
}
