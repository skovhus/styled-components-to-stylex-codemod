import React from "react";
import styled from "styled-components";

// Bug 8: Static properties on styled components are lost when
// they become wrapper functions. The codemod must preserve these.

export const ListItem = styled.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;

export const Header = styled.header`
  height: 64px;
  background: white;
`;

Header.HEIGHT = 64;

export function App() {
  const itemHeight = ListItem.HEIGHT;
  const headerHeight = Header.HEIGHT;
  return (
    <div style={{ paddingTop: headerHeight }}>
      <Header>Title</Header>
      <ListItem style={{ height: itemHeight }}>Item 1</ListItem>
      <ListItem style={{ height: itemHeight }}>Item 2</ListItem>
    </div>
  );
}
