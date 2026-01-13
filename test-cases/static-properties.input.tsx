import * as React from "react";
import styled from "styled-components";
import { ActionMenuTextDivider, ActionMenuGroupHeader } from "./lib/action-menu-divider";

// Static properties on styled components should be preserved when
// they become wrapper functions.

// Pattern 1: Static properties defined directly on styled component
export const ListItem = styled.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;

// Pattern 2: styled(BaseComponent) with static props defined in same file
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

ExtendedButton.HEIGHT = (BaseButton as any).HEIGHT;

// Pattern 3: styled(ImportedComponent) should inherit static properties
// ActionMenuTextDivider.HEIGHT is defined in another file
export const CommandMenuTextDivider = styled(ActionMenuTextDivider)`
  padding-left: 20px;
`;

// Pattern 4: Another imported component with static property
export const CommandMenuGroupHeader = styled(ActionMenuGroupHeader)`
  padding-inline: 14px;
`;

export function App() {
  const itemHeight = ListItem.HEIGHT;
  const buttonHeight = ExtendedButton.HEIGHT;
  return (
    <div>
      <ListItem style={{ height: itemHeight }}>Item 1</ListItem>
      <ExtendedButton style={{ height: buttonHeight }}>Click me</ExtendedButton>
      <CommandMenuTextDivider text="Divider" />
      <CommandMenuGroupHeader title="Header" />
    </div>
  );
}
