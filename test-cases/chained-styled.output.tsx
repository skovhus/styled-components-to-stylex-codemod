import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

type HelpTextProps = Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">;

/** Styled text for form help messages - extends the non-exported StyledText. */
export function HelpText(props: HelpTextProps) {
  return <Text {...props} {...stylex.props(styles.text, styles.helpText)} />;
}

type SeparatorProps = Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">;

/** Styled separator text between form elements - directly wraps Text. */
export function Separator(props: SeparatorProps) {
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
