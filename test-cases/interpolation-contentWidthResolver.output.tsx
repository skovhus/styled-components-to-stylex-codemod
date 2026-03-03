import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $layout } from "./tokens.stylex";

export function SkillLayout(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  const { children, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.skillLayout)}>
      {children}
    </div>
  );
}

export function App() {
  return <SkillLayout>Content</SkillLayout>;
}

const styles = stylex.create({
  skillLayout: {
    position: "relative",
    maxWidth: $layout.contentMaxWidth,
  },
});
