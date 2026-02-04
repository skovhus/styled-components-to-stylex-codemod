import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

/** Styled text for form help messages - extends the non-exported StyledText. */
export function HelpText(
  props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">,
) {
  return <Text {...props} {...stylex.props(styles.text, styles.helpText)} />;
}

/** Styled separator text between form elements - directly wraps Text. */
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
    marginLeft: "8px",
  },
  helpText: {
    marginLeft: "4px",
  },
  separator: {
    marginRight: "4px",
  },
});
