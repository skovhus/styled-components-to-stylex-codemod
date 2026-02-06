import React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: `styled(Button)` is inlined as `<Button {...stylex.props(...)}>` but Button's
// props type doesn't include `className` or `style`, so the spread is incompatible.
// Causes TS2769 (no overload matches) or TS2322 (type not assignable).
function Button(props: { onClick: () => void; children: React.ReactNode; variant?: string }) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

function StyledButton(
  props: Omit<React.ComponentPropsWithRef<typeof Button>, "className" | "style">,
) {
  return <Button {...props} {...stylex.props(styles.button)} />;
}

export const App = () => (
  <StyledButton onClick={() => {}} variant="primary">
    Click me
  </StyledButton>
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
