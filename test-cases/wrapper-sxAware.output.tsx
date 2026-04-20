import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

// Single call site → inlined into JSX directly.
function StyledButton(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { children, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={styles.button}>
      {children}
    </SxAwareButton>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <StyledButton>Default</StyledButton>
    <StyledButton className="extra-class" style={{ marginTop: 4 }}>
      With external className/style
    </StyledButton>
    <SxAwareButton sx={styles.primary}>Primary 1</SxAwareButton>
    <SxAwareButton sx={styles.primary}>Primary 2</SxAwareButton>
  </div>
);

const styles = stylex.create({
  button: {
    color: "#bf4f74",
    fontWeight: "bold",
  },
  // Multiple call sites → emitted as a wrapper function component.
  primary: {
    color: "white",
  },
});
