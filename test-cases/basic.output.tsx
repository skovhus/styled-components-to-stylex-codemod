import React from "react";
import * as stylex from "@stylexjs/stylex";

type SelectProps = Omit<React.ComponentProps<"select">, "className" | "style">;

export function Select(props: SelectProps) {
  const { children, ...rest } = props;
  return (
    <select {...rest} {...stylex.props(styles.select)}>
      {children}
    </select>
  );
}

export const App = () => (
  <section {...stylex.props(styles.wrapper)}>
    <h1 {...stylex.props(styles.title)}>Hello World!</h1>
    <Select onChange={(e) => console.log(e.target.value)} />
  </section>
);

const styles = stylex.create({
  /**
   * Page title with brand color styling.
   */
  title: {
    fontSize: "1.5em",
    textAlign: "center",
    color: "#bf4f74",
  },

  // Page wrapper with padding
  wrapper: {
    padding: "4em",
    backgroundColor: "papayawhip",
  },
  select: {
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: "4px",
    fontSize: "13px",
  },
});
