import React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: `styled(Button)` is inlined as `<Button {...stylex.props(...)}>` but Button's
// props type doesn't include `className` or `style`, so the spread is incompatible.
// Causes TS2769 (no overload matches) or TS2322 (type not assignable).
function Button(props: { onClick: () => void; children: React.ReactNode; variant?: string }) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

export const App = () => (
  <Button onClick={() => {}} variant="primary" {...stylex.props(styles.button)}>
    Click me
  </Button>
);

const styles = stylex.create({
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "4px",
    backgroundColor: "blue",
    color: "white",
  },
});
