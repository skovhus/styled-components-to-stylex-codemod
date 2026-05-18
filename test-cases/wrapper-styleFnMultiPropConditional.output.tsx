import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type PanelProps = {
  compact: boolean;
  isExpanded: boolean;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

function Panel(props: PanelProps) {
  const { children, compact, isExpanded, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(styles.panel(compact, isExpanded), compact && styles.panelCompact)}
    >
      {children}
    </Flex>
  );
}

export const App = (props: { compact: boolean; isExpanded: boolean }) => (
  <Panel compact={props.compact} isExpanded={props.isExpanded}>
    Content
  </Panel>
);

const styles = stylex.create({
  panel: (compact: boolean, isExpanded: boolean) => ({
    borderRadius: 0,
    backgroundColor: "unset",
    overflowY: compact && isExpanded ? "auto" : "hidden",
    maxHeight: compact && isExpanded ? "200px" : "none",
  }),
  panelCompact: {
    backgroundColor: "transparent",
  },
});
