import React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: `styled(EditorLoader)` is inlined as `<EditorLoader {...stylex.props(...)}>` but
// EditorLoader's props type only accepts `content` and `ref` — not `className` or `style`.
// The stylex.props() spread is incompatible with the component's type. Causes TS2322.
function EditorLoader(props: { content: string; ref?: React.Ref<HTMLDivElement> }) {
  return <div>{props.content}</div>;
}

export const App = () => <EditorLoader content="hello" {...stylex.props(styles.editor)} />;

const styles = stylex.create({
  editor: {
    paddingTop: "24px",
    paddingRight: 0,
    paddingBottom: "48px",
    paddingLeft: 0,
  },
});
