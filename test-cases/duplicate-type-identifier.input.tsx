import * as React from "react";
import styled from "styled-components";

// Bug 9: When generating wrapper function with props type,
// codemod must not create duplicate type identifier if one already exists.

/**
 * Card props
 */
export interface CardProps {
  /** Title of the card */
  title: string;
  /** Whether the card is highlighted */
  highlighted?: boolean;
}

// The styled component uses the existing props interface
export const Card = styled.div<CardProps>`
  padding: 16px;
  background: white;
  border: ${(props) => (props.highlighted ? "2px solid blue" : "1px solid gray")};
`;

// Usage shows both interface properties and HTML attributes are needed
export function App() {
  return (
    <Card title="My Card" highlighted className="custom-class" onClick={() => {}}>
      Card content
    </Card>
  );
}
