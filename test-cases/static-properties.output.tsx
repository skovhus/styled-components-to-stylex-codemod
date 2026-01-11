import * as stylex from "@stylexjs/stylex";
import * as React from "react";
import { ActionMenuTextDivider, ActionMenuGroupHeader } from "./lib/action-menu-divider";

type ListItemProps = React.HTMLAttributes<HTMLDivElement>;

// Static properties on styled components should be preserved when
// they become wrapper functions.

// Pattern 1: Static properties defined directly on styled component
export function ListItem(props: ListItemProps) {
  const { className, children, style } = props;

  const sx = stylex.props(styles.listItem);
  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;
type BaseButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

// Pattern 2: styled(BaseComponent) with static props defined in same file
function BaseButton(props: BaseButtonProps) {
  const { className, children, style } = props;

  const sx = stylex.props(styles.baseButton);
  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

BaseButton.HEIGHT = 36;
type ExtendedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

// ExtendedButton should have HEIGHT from BaseButton
export function ExtendedButton(props: ExtendedButtonProps) {
  const { className, children, style } = props;

  const sx = stylex.props(styles.baseButton, styles.extendedButton);
  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

ExtendedButton.HEIGHT = (BaseButton as any).HEIGHT;
type CommandMenuTextDividerProps = Omit<
  React.ComponentProps<typeof ActionMenuTextDivider>,
  "children" | "className" | "style"
>;

export function CommandMenuTextDivider(props: CommandMenuTextDividerProps) {
  return <ActionMenuTextDivider {...props} {...stylex.props(styles.commandMenuTextDivider)} />;
}

CommandMenuTextDivider.HEIGHT = ActionMenuTextDivider.HEIGHT;
type CommandMenuGroupHeaderProps = Omit<
  React.ComponentProps<typeof ActionMenuGroupHeader>,
  "children" | "className" | "style"
>;

export function CommandMenuGroupHeader(props: CommandMenuGroupHeaderProps) {
  return <ActionMenuGroupHeader {...props} {...stylex.props(styles.commandMenuGroupHeader)} />;
}

CommandMenuGroupHeader.HEIGHT = ActionMenuGroupHeader.HEIGHT;

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
