import React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: `styled(EditorLoader)` is inlined as `<EditorLoader {...stylex.props(...)}>` but
// EditorLoader's props type only accepts `content` and `ref` — not `className` or `style`.
// The stylex.props() spread is incompatible with the component's type. Causes TS2322.
function EditorLoader(props: { content: string; ref?: React.Ref<HTMLDivElement> }) {
  return <div>{props.content}</div>;
}

function Editor(
  props: Omit<React.ComponentPropsWithRef<typeof EditorLoader>, "className" | "style">,
) {
  return <EditorLoader {...props} {...stylex.props(styles.editor)} />;
}

export const App = () => <Editor content="hello" />;

const styles = stylex.create({
  editor: {
    paddingTop: "24px",
    paddingRight: 0,
    paddingBottom: "48px",
    paddingLeft: 0,
  },
});
