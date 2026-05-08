import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

export function HelpText(
  props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">,
) {
  return <Text {...props} {...stylex.props(styles.text, styles.helpText)} />;
}

export function Separator(
  props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">,
) {
  return <Text {...props} {...stylex.props(styles.separator)} />;
}

export const App = () => (
  <div>
    <HelpText>Help text content</HelpText>
    <Separator>|</Separator>
  </div>
);

const styles = stylex.create({
  // Non-exported styled component that wraps an imported component
  text: {
    marginLeft: 8,
  },
  helpText: {
    marginLeft: 4,
  },
  separator: {
    marginRight: 4,
  },
});
