import React from "react";
import styled from "styled-components";

// Bug 8: Static properties on styled components are lost when
// they become wrapper functions. The codemod must preserve these.

// Pattern 1: Static properties defined directly on styled component
export const ListItem = styled.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;

// Pattern 2: styled(BaseComponent) should inherit static properties from BaseComponent
const BaseButton = styled.button`
  padding: 8px 16px;
  background: gray;
`;

BaseButton.HEIGHT = 36;

// ExtendedButton should have HEIGHT from BaseButton
export const ExtendedButton = styled(BaseButton)`
  background: blue;
  color: white;
`;

export function App() {
  const itemHeight = ListItem.HEIGHT;
  // This should work - ExtendedButton.HEIGHT should be 36 from BaseButton
  const buttonHeight = ExtendedButton.HEIGHT;
  return (
    <div>
      <ListItem style={{ height: itemHeight }}>Item 1</ListItem>
      <ExtendedButton style={{ height: buttonHeight }}>Click me</ExtendedButton>
    </div>
  );
}
