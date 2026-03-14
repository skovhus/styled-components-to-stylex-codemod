import React from "react";
import * as stylex from "@stylexjs/stylex";
import { motion } from "./lib/framer-motion";
import { UserAvatar } from "./lib/user-avatar";

type ComponentWrapperProps = { isOpen: boolean } & Omit<
  React.ComponentPropsWithRef<typeof motion.div>,
  "className" | "style"
>;

function ComponentWrapper(props: ComponentWrapperProps) {
  const { children, isOpen, ...rest } = props;

  return (
    <motion.div
      {...rest}
      {...stylex.props(styles.componentWrapper, isOpen && styles.componentWrapperOpen)}
    >
      {children}
    </motion.div>
  );
}

type HighlightedAvatarProps = { highlightColor?: string } & Omit<
  React.ComponentPropsWithRef<typeof UserAvatar>,
  "className" | "style"
>;

function HighlightedAvatar(props: HighlightedAvatarProps) {
  const { highlightColor, ...rest } = props;

  return (
    <UserAvatar
      {...rest}
      {...stylex.props(
        styles.highlightedAvatar({
          boxShadow: `0 0 0 2px ${highlightColor ?? "transparent"}`,
        }),
      )}
    />
  );
}

export const App = () => (
  <div>
    <ComponentWrapper isOpen={true} initial={{ height: 40 }} animate={{ height: 200 }}>
      Open content
    </ComponentWrapper>
    <ComponentWrapper isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </ComponentWrapper>
    <HighlightedAvatar user="Alice" size="small" highlightColor="blue" />
    <HighlightedAvatar user="Bob" size="tiny" />
  </div>
);

const styles = stylex.create({
  componentWrapper: {
    backgroundColor: "white",
    borderRadius: "20px",
    overflow: "hidden",
  },
  componentWrapperOpen: {
    borderRadius: "8px",
  },
  highlightedAvatar: (props: { boxShadow: string }) => ({
    borderRadius: "50%",
    // eslint-disable-next-line stylex/valid-styles -- dynamic style fn param
    boxShadow: props.boxShadow,
  }),
});
