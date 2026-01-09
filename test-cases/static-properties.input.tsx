import * as React from "react";
import styled from "styled-components";
import { ActionMenuTextDivider, ActionMenuGroupHeader } from "./lib/action-menu-divider";

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

// Pattern 2: styled(BaseComponent) with static props defined in SAME FILE
const BaseButton = styled.button`
  padding: 8px 16px;
  background: gray;
`;

BaseButton.HEIGHT = 36;

// ExtendedButton should have HEIGHT from BaseButton (same file)
export const ExtendedButton = styled(BaseButton)`
  background: blue;
  color: white;
`;

// Pattern 3: styled(ImportedComponent) should inherit static properties from IMPORTED component
// This is the CommandMenuTextDivider pattern - ActionMenuTextDivider.HEIGHT = 30 is defined in another file
export const CommandMenuTextDivider = styled(ActionMenuTextDivider)`
  padding-left: 20px;
`;

// Pattern 4: Another imported component with static property
export const CommandMenuGroupHeader = styled(ActionMenuGroupHeader)`
  padding-inline: 14px;
`;

export function App() {
  const itemHeight = ListItem.HEIGHT;
  // This should work - ExtendedButton.HEIGHT should be 36 from BaseButton
  const buttonHeight = ExtendedButton.HEIGHT;
  // This should work - CommandMenuTextDivider.HEIGHT should be 30 from ActionMenuTextDivider (imported)
  const dividerHeight = CommandMenuTextDivider.HEIGHT;
  // This should work - CommandMenuGroupHeader.HEIGHT should be 28 from ActionMenuGroupHeader (imported)
  const headerHeight = CommandMenuGroupHeader.HEIGHT;
  return (
    <div>
      <ListItem style={{ height: itemHeight }}>Item 1</ListItem>
      <ExtendedButton style={{ height: buttonHeight }}>Click me</ExtendedButton>
      <CommandMenuTextDivider style={{ height: dividerHeight }} text="Divider" />
      <CommandMenuGroupHeader style={{ height: headerHeight }} title="Header" />
    </div>
  );
}
