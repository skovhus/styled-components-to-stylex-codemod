import * as stylex from "@stylexjs/stylex";
import * as React from "react";
import { ActionMenuTextDivider, ActionMenuGroupHeader } from "./lib/action-menu-divider";

type ListItemProps = React.ComponentProps<"div">;

// Pattern 1: Static properties defined directly on styled component
export function ListItem(props: ListItemProps) {
  const { children, style, ...rest } = props;
  return (
    <div {...rest} {...stylex.props(styles.listItem)} style={style}>
      {children}
    </div>
  );
}

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;
type BaseButtonProps = React.ComponentProps<"button">;

// Pattern 2: styled(BaseComponent) with static props defined in SAME FILE
function BaseButton(props: BaseButtonProps) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.baseButton);
  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

type ExtendedButtonProps = React.ComponentProps<"button">;

// ExtendedButton should have HEIGHT from BaseButton (same file)
export function ExtendedButton(props: ExtendedButtonProps) {
  const { children, style, ...rest } = props;
  return (
    <button {...rest} {...stylex.props(styles.baseButton, styles.extendedButton)} style={style}>
      {children}
    </button>
  );
}

ExtendedButton.HEIGHT = BaseButton.HEIGHT;
type CommandMenuTextDividerProps = React.ComponentProps<typeof ActionMenuTextDivider>;

export function CommandMenuTextDivider(props: CommandMenuTextDividerProps) {
  return <ActionMenuTextDivider {...props} {...stylex.props(styles.commandMenuTextDivider)} />;
}

CommandMenuTextDivider.HEIGHT = ActionMenuTextDivider.HEIGHT;
type CommandMenuGroupHeaderProps = React.ComponentProps<typeof ActionMenuGroupHeader>;

export function CommandMenuGroupHeader(props: CommandMenuGroupHeaderProps) {
  return <ActionMenuGroupHeader {...props} {...stylex.props(styles.commandMenuGroupHeader)} />;
}

CommandMenuGroupHeader.HEIGHT = ActionMenuGroupHeader.HEIGHT;

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

// Bug 8: Static properties on styled components are lost when
// they become wrapper functions. The codemod must preserve these.

const styles = stylex.create({
  listItem: {
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
  },
  baseButton: {
    padding: "8px 16px",
    backgroundColor: "gray",
  },
  extendedButton: {
    backgroundColor: "blue",
    color: "white",
  },
  commandMenuTextDivider: {
    paddingLeft: "20px",
  },
  commandMenuGroupHeader: {
    paddingInline: "14px",
  },
});
