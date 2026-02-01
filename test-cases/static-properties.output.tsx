import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { ActionMenuTextDivider, ActionMenuGroupHeader } from "./lib/action-menu-divider";

type ListItemProps = Omit<React.ComponentProps<"div">, "style">;

// Static properties on styled components should be preserved when
// they become wrapper functions.

// Pattern 1: Static properties defined directly on styled component
export function ListItem(props: ListItemProps) {
  const { className, children } = props;
  return <div {...mergedSx(styles.listItem, className)}>{children}</div>;
}

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;
type BaseButtonProps = Omit<React.ComponentProps<"button">, "style"> & { as?: React.ElementType };

// Pattern 2: styled(BaseComponent) with static props defined in same file
function BaseButton(props: BaseButtonProps) {
  const { as: Component = "button", className, children } = props;
  return <Component {...mergedSx(styles.baseButton, className)}>{children}</Component>;
}

BaseButton.HEIGHT = 36;
type ExtendedButtonProps = Omit<React.ComponentProps<"button">, "style">;

// ExtendedButton should have HEIGHT from BaseButton
export function ExtendedButton(props: ExtendedButtonProps) {
  const { className, children } = props;
  return (
    <button {...mergedSx([styles.baseButton, styles.extendedButton], className)}>{children}</button>
  );
}

ExtendedButton.HEIGHT = (BaseButton as any).HEIGHT;
type CommandMenuTextDividerProps = Omit<
  React.ComponentPropsWithRef<typeof ActionMenuTextDivider>,
  "style" | "className"
>;

// Pattern 3: styled(ImportedComponent) should inherit static properties
// ActionMenuTextDivider.HEIGHT is defined in another file
export function CommandMenuTextDivider(props: CommandMenuTextDividerProps) {
  return <ActionMenuTextDivider {...props} {...stylex.props(styles.commandMenuTextDivider)} />;
}

CommandMenuTextDivider.HEIGHT = ActionMenuTextDivider.HEIGHT;
type CommandMenuGroupHeaderProps = Omit<
  React.ComponentPropsWithRef<typeof ActionMenuGroupHeader>,
  "style" | "className"
>;

// Pattern 4: Another imported component with static property
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
    paddingBlock: "8px",
    paddingInline: "12px",
    display: "flex",
    alignItems: "center",
  },
  baseButton: {
    paddingBlock: "8px",
    paddingInline: "16px",
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
