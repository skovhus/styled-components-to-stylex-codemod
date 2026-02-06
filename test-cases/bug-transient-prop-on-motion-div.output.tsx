import React from "react";
import * as stylex from "@stylexjs/stylex";
import { motion } from "./lib/framer-motion";

type PulseWrapperProps = Omit<
  React.ComponentPropsWithRef<typeof motion.div>,
  "className" | "style"
> & {
  $isOpen: boolean;
};

// Bug: styled(motion.div)<{ $isOpen: boolean }> is converted, but the output
// passes the transient $isOpen prop directly to motion.div which doesn't accept it.
// Also, stylex.props() spreads data-style-src onto motion.div which rejects it.

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

export const App = () => (
  <div>
    <PulseWrapper $isOpen={true} initial={{ height: 40 }} animate={{ height: 200 }}>
      Open content
    </PulseWrapper>
    <PulseWrapper $isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </PulseWrapper>
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
});
