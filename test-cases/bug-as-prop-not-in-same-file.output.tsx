import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

// Bug: styled(Text) always supports the `as` prop for polymorphism, but the codemod
// only adds `as` to the wrapper type when it detects `as` usage in the same file.
// Exported components used with `as` in other files lose polymorphism. Causes TS2322.

export function HeaderTitle(
  props: Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">,
) {
  return <Text {...props} {...stylex.props(styles.headerTitle)} />;
}

export const App = () => (
  <div>
    <HeaderTitle variant="large">Default Title</HeaderTitle>
  </div>
);

const styles = stylex.create({
  headerTitle: {
    fontSize: "24px",
    fontWeight: 600,
  },
});
