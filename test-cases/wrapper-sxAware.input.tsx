// styled(Component) where the wrapped component accepts a StyleX `sx` prop.
// The codemod auto-detects sx support by walking the imported component's
// prop type signature (no adapter configuration required), so it emits
// `sx={styles.x}` instead of `{...stylex.props(styles.x)}` on the rendered
// wrapped component.
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";
// Generic component whose props type intersects an aliased object literal
// containing `sx?:` — exercises type-alias resolution + intersection walking.
import { Text } from "./lib/sx-aware-text";

// Single call site → inlined into JSX directly.
const StyledButton = styled(SxAwareButton)`
  color: #bf4f74;
  font-weight: bold;
`;

// Multiple call sites → emitted as a wrapper function component.
const StyledPrimary = styled(SxAwareButton)`
  color: white;
`;

// Single call site with caller-passed sx → tests inlined path composing
// the caller's sx with the styled component's internal sx.
const InlinedAccent = styled(SxAwareButton)`
  background-color: #fef3c7;
`;

// Exported wrapper with external `sx` support (per fixture adapter
// externalInterface). Even when the wrapped component accepts `sx`, the
// wrapper itself accepts an external `sx` prop and must compose it with the
// internal `styles.exportedAccent` style.
export const ExportedAccentButton = styled(SxAwareButton)`
  color: red;
`;

// Wrapping the generic Text component — auto-detection has to walk
// `TextComponentProps`'s intersection (TextProps & Omit<…> & { sx?: … }) to
// find the `sx` member.
const StyledText = styled(Text)`
  color: navy;
  line-height: 20px;
`;

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
    <StyledPrimary>Primary 1</StyledPrimary>
    <StyledPrimary>Primary 2</StyledPrimary>
    <InlinedAccent sx={callerStyles.caller}>Inlined with caller sx</InlinedAccent>
    <ExportedAccentButton>Exported</ExportedAccentButton>
    <ExportedAccentButton sx={callerStyles.caller}>Exported with caller sx</ExportedAccentButton>
    <StyledText size="md">Generic Text</StyledText>
  </div>
);
