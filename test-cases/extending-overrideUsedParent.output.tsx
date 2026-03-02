// Extending a styled component that wraps an imported component, where parent is also used directly in JSX
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

// Non-exported styled component wrapping an imported component — used directly in JSX
function StyledText(props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">) {
  return <Text {...props} {...stylex.props(styles.text)} />;
}

/** Exported child that extends the non-exported parent, overriding margin-left. */
export function HelpText(
  props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">,
) {
  return <Text {...props} {...stylex.props(styles.text, styles.helpText)} />;
}

export const App = () => (
  <div>
    <StyledText>Direct use of parent (margin-left: 8px)</StyledText>
    <HelpText>Child overrides margin-left to 4px</HelpText>
  </div>
);

const styles = stylex.create({
  text: {
    marginLeft: "8px",
    color: "blue",
  },
  helpText: {
    marginLeft: "4px",
  },
});
