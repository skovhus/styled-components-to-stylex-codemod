import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

function List(props: Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">) {
  return <Flex {...props} column={true} {...stylex.props(styles.list)} />;
}

export const App = () => (
  <List>
    <div>Item 1</div>
    <div>Item 2</div>
  </List>
);

const styles = stylex.create({
  list: {
    backgroundColor: "white",
    borderRadius: "4px",
  },
});
