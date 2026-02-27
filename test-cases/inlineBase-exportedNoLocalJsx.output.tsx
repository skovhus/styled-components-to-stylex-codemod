import React from "react";
import * as stylex from "@stylexjs/stylex";

export function Container(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.container)}>
      {children}
    </div>
  );
}

export function App() {
  return <div>Exported only</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "4px",
    backgroundColor: "#f4f4ff",
  },
});
