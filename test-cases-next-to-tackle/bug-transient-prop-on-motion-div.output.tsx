import React from "react";
import * as stylex from "@stylexjs/stylex";
import { motion } from "./lib/framer-motion";
import { UserAvatar } from "./lib/user-avatar";

type PulseWrapperProps = Omit<
  React.ComponentPropsWithRef<typeof motion.div>,
  "className" | "style"
> & {
  $isOpen: boolean;
};

// Bug: styled(motion.div)<{ $isOpen: boolean }> converts but the codemod
// may inline the usage, passing the transient $isOpen prop directly to
// motion.div which doesn't accept it. Similarly, styled(UserAvatar)<{ $highlight }>
// leaks $highlight to UserAvatar. styled-components auto-strips $-prefixed props.

function PulseWrapper(props: PulseWrapperProps) {
  const { children, $isOpen, ...rest } = props;

  return (
    <motion.div
      {...rest}
      {...stylex.props(styles.pulseWrapper, $isOpen ? styles.pulseWrapperOpen : undefined)}
    >
      {children}
    </motion.div>
  );
}

type HighlightedAvatarProps = Omit<
  React.ComponentPropsWithRef<typeof UserAvatar>,
  "className" | "style"
> & {
  $highlightColor?: string;
};

function HighlightedAvatar(props: HighlightedAvatarProps) {
  const { $highlightColor, ...rest } = props;

  return (
    <UserAvatar
      {...rest}
      {...stylex.props(
        styles.highlightedAvatar,
        styles.highlightedAvatarBoxShadow(`0 0 0 2px ${$highlightColor ?? "transparent"}`),
      )}
    />
  );
}

export const App = () => (
  <div>
    <PulseWrapper $isOpen={true} initial={{ height: 40 }} animate={{ height: 200 }}>
      Open content
    </PulseWrapper>
    <PulseWrapper $isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </PulseWrapper>
    <HighlightedAvatar user="Alice" size="small" $highlightColor="blue" enablePresence={false} />
    <HighlightedAvatar user="Bob" size="tiny" enablePresence={false} />
  </div>
);

const styles = stylex.create({
  pulseWrapper: {
    backgroundColor: "white",
    borderRadius: "20px",
    overflow: "hidden",
  },
  pulseWrapperOpen: {
    borderRadius: "8px",
  },
  highlightedAvatar: {
    boxShadow: "0 0 0 2px transparent",
    borderRadius: "50%",
  },
  highlightedAvatarBoxShadow: (boxShadow: string) => ({
    boxShadow,
  }),
});
