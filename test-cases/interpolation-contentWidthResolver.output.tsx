import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $layout } from "./tokens.stylex";

export function Layout(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  const { children, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.layout)}>
      {children}
    </div>
  );
}

export function App() {
  return <Layout>Content</Layout>;
}

const styles = stylex.create({
  layout: {
    position: "relative",
    maxWidth: $layout.contentMaxWidth,
  },
});
