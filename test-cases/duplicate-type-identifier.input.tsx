import * as React from "react";
import styled from "styled-components";

// Bug 9: When generating wrapper function with props type,
// codemod must not create duplicate type identifier if one already exists.

// Pattern 1: styled.div<ExistingType> - type defined before styled component
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

// Pattern 2: styled(FunctionComponent) - from IconButton.tsx
// The function component has its own props type, then styled() wraps it
/** Props for IconButton. */
export type IconButtonProps = {
  /** Icon to display in the button. */
  children?: React.ReactNode;
  /** Aria label for the button. */
  "aria-label": string;
  /** Applies hover styles. */
  $hoverStyles?: boolean;
};

const IconButtonInner = (props: IconButtonProps) => {
  const { children, ...rest } = props;
  return <button {...rest}>{children}</button>;
};

// styled(FunctionComponent) should NOT create a duplicate IconButtonProps type
export const IconButton = styled(IconButtonInner)`
  padding: 0 2px;
  box-shadow: none;
`;

// Usage shows both interface properties and HTML attributes are needed
export function App() {
  return (
    <>
      <Card title="My Card" highlighted className="custom-class" onClick={() => {}}>
        Card content
      </Card>
      <IconButton aria-label="Close" $hoverStyles>
        X
      </IconButton>
    </>
  );
}
