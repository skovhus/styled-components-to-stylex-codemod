import * as React from "react";

// Base component with static HEIGHT property (simulating ActionMenuTextDivider)
type ActionMenuTextDividerProps = React.ComponentProps<"div"> & { text: string };

export const ActionMenuTextDivider = (props: ActionMenuTextDividerProps) => {
  const { text, ...rest } = props;
  return <div {...rest}>{text}</div>;
};

ActionMenuTextDivider.HEIGHT = 30;

// Another component with static property
type ActionMenuGroupHeaderProps = React.ComponentProps<"div"> & { title: string };

export const ActionMenuGroupHeader = (props: ActionMenuGroupHeaderProps) => {
  const { title, ...rest } = props;
  return <div {...rest}>{title}</div>;
};

ActionMenuGroupHeader.HEIGHT = 28;
