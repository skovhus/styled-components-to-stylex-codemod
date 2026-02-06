import React from "react";
import styled from "styled-components";

// Bug: `styled(Button)` is inlined as `<Button {...stylex.props(...)}>` but Button's
// props type doesn't include `className` or `style`, so the spread is incompatible.
// Causes TS2769 (no overload matches) or TS2322 (type not assignable).
function Button(props: { onClick: () => void; children: React.ReactNode; variant?: string }) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

export const StyledButton = styled(Button)`
  padding: 8px 16px;
  border-radius: 4px;
  background-color: blue;
  color: white;
`;

export const App = () => (
  <StyledButton onClick={() => {}} variant="primary">
    Click me
  </StyledButton>
);
