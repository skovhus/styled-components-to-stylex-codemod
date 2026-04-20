// styled(Component) where the wrapped component accepts a StyleX `sx` prop.
// The adapter's `wrappedComponentInterface` hook returns `{ acceptsSx: true }`
// for this import, so the codemod emits `sx={styles.x}` instead of
// `{...stylex.props(styles.x)}` on the rendered wrapped component.
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";

// Single call site → inlined into JSX directly.
const StyledButton = styled(SxAwareButton)`
  color: #bf4f74;
  font-weight: bold;
`;

// Multiple call sites → emitted as a wrapper function component.
const StyledPrimary = styled(SxAwareButton)`
  color: white;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <StyledButton>Default</StyledButton>
    <StyledButton className="extra-class" style={{ marginTop: 4 }}>
      With external className/style
    </StyledButton>
    <StyledPrimary>Primary 1</StyledPrimary>
    <StyledPrimary>Primary 2</StyledPrimary>
  </div>
);
