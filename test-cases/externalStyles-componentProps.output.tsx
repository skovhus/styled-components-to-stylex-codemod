import React from "react";
import * as stylex from "@stylexjs/stylex";

function ComponentLoader(props: { content: string; ref?: React.Ref<HTMLDivElement> }) {
  return <div>{props.content}</div>;
}

function Component(
  props: Omit<React.ComponentPropsWithRef<typeof ComponentLoader>, "className" | "style">,
) {
  return <ComponentLoader {...props} {...stylex.props(styles.component)} />;
}

export const App = () => <Component content="hello" />;

const styles = stylex.create({
  component: {
    paddingTop: "24px",
    paddingRight: 0,
    paddingBottom: "48px",
    paddingLeft: 0,
  },
});
