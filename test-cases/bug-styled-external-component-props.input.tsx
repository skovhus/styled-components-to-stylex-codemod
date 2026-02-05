import React from "react";
import styled from "styled-components";

// Bug: `styled(EditorLoader)` is inlined as `<EditorLoader {...stylex.props(...)}>` but
// EditorLoader's props type only accepts `content` and `ref` — not `className` or `style`.
// The stylex.props() spread is incompatible with the component's type. Causes TS2322.
function EditorLoader(props: { content: string; ref?: React.Ref<HTMLDivElement> }) {
  return <div>{props.content}</div>;
}

const Editor = styled(EditorLoader)`
  padding: 24px 0 48px;
`;

export const App = () => <Editor content="hello" />;
