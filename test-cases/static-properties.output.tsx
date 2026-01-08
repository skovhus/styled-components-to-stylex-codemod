import * as stylex from "@stylexjs/stylex";
import React from "react";

// Bug 8: Static properties on styled components are lost when
// they become wrapper functions. The codemod must preserve these.

const styles = stylex.create({
  listItem: {
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
  },
  header: {
    height: "64px",
    backgroundColor: "white",
  },
});

type ListItemProps = React.ComponentProps<"div">;

// they become wrapper functions. The codemod must preserve these.

export function ListItem(props: ListItemProps) {
  const { children, style, ...rest } = props;
  return (
    <div {...rest} {...stylex.props(styles.listItem)} style={style}>
      {children}
    </div>
  );
}

type HeaderProps = React.ComponentProps<"header">;

export function Header(props: HeaderProps) {
  const { children, style, ...rest } = props;
  return (
    <header {...rest} {...stylex.props(styles.header)} style={style}>
      {children}
    </header>
  );
}

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;
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
