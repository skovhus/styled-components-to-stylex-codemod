import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { ActionMenuTextDivider, ActionMenuGroupHeader } from "./lib/action-menu-divider";

// Static properties on styled components should be preserved when
// they become wrapper functions.

// Pattern 1: Static properties defined directly on styled component
export function ListItem(props: React.ComponentProps<"div">) {
  const { className, children, style, ...rest } = props;

  return (
    <div {...rest} {...mergedSx(styles.listItem, className, style)}>
      {children}
    </div>
  );
}

ListItem.HEIGHT = 42;
ListItem.PADDING = 8;

// Pattern 2: styled(BaseComponent) with static props defined in same file
function BaseButton<C extends React.ElementType = "button">(
  props: React.ComponentProps<"button"> & { as?: C },
) {
  const { as: Component = "button", className, children, style } = props;

  return <Component {...mergedSx(styles.baseButton, className, style)}>{children}</Component>;
}

BaseButton.HEIGHT = 36;

// ExtendedButton should have HEIGHT from BaseButton
export function ExtendedButton(props: React.ComponentProps<"button">) {
  const { className, children, style, ...rest } = props;

  return (
    <button {...rest} {...mergedSx([styles.baseButton, styles.extendedButton], className, style)}>
      {children}
    </button>
  );
}

ExtendedButton.HEIGHT = (BaseButton as any).HEIGHT;

// Pattern 3: styled(ImportedComponent) should inherit static properties
// ActionMenuTextDivider.HEIGHT is defined in another file
export function CommandMenuTextDivider(
  props: Omit<React.ComponentPropsWithRef<typeof ActionMenuTextDivider>, "className" | "style">,
) {
  return <ActionMenuTextDivider {...props} {...stylex.props(styles.commandMenuTextDivider)} />;
}

CommandMenuTextDivider.HEIGHT = ActionMenuTextDivider.HEIGHT;

// Pattern 4: Another imported component with static property
export function CommandMenuGroupHeader(
  props: Omit<React.ComponentPropsWithRef<typeof ActionMenuGroupHeader>, "className" | "style">,
) {
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
    backgroundImage: "none",
  },
  extendedButton: {
    backgroundColor: "blue",
    backgroundImage: "none",
    color: "white",
  },
  commandMenuTextDivider: {
    paddingLeft: "20px",
  },
  commandMenuGroupHeader: {
    paddingInline: "14px",
  },
});
