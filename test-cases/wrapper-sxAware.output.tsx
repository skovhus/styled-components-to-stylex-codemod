import * as React from "react";

// styled(Component) where the wrapped component accepts a StyleX `sx` prop.
// The adapter's `wrappedComponentInterface` hook returns `{ acceptsSx: true }`
// for this import, so the codemod emits `sx={styles.x}` instead of
// `{...stylex.props(styles.x)}` on the rendered wrapped component.
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

// Single call site → inlined into JSX directly.
function StyledButton(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={[styles.button, sx]}>
      {children}
    </SxAwareButton>
  );
}

// Exported wrapper with external `sx` support (per fixture adapter
// externalInterface). Even when the wrapped component accepts `sx`, the
// wrapper itself accepts an external `sx` prop and must compose it with the
// internal `styles.exportedAccent` style.
export function ExportedAccentButton(
  props: {
    className?: string;
    style?: React.CSSProperties;
    sx?: stylex.StyleXStyles;
  } & React.ComponentPropsWithRef<typeof SxAwareButton>,
) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={[styles.exportedAccentButton, sx]}>
      {children}
    </SxAwareButton>
  );
}

const callerStyles = stylex.create({
  caller: { textDecorationLine: "underline" },
});

export const App = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16, width: 480 }}>
    <StyledButton>Default</StyledButton>
    <StyledButton className="extra-class" style={{ marginTop: 4 }}>
      With external className/style
    </StyledButton>
    {/* Caller passes its own sx — must compose with the wrapper's internal sx */}
    <StyledButton sx={callerStyles.caller}>Caller sx</StyledButton>
    <SxAwareButton sx={styles.primary}>Primary 1</SxAwareButton>
    <SxAwareButton sx={styles.primary}>Primary 2</SxAwareButton>
    <SxAwareButton sx={[styles.inlinedAccent, callerStyles.caller]}>
      Inlined with caller sx
    </SxAwareButton>
    <ExportedAccentButton>Exported</ExportedAccentButton>
    <ExportedAccentButton sx={callerStyles.caller}>Exported with caller sx</ExportedAccentButton>
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
  // Single call site with caller-passed sx → tests inlined path composing
  // the caller's sx with the styled component's internal sx.
  inlinedAccent: {
    backgroundColor: "#fef3c7",
  },
  exportedAccentButton: {
    color: "red",
  },
});
