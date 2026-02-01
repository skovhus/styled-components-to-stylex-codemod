// @expected-warning: Unsupported call expression (expected imported helper(...) or imported helper(...)(...))
import styled, { css } from "styled-components";

// `css` helper used outside of a styled component template
// Cannot be statically transformed to StyleX
// Solution: we could still call the adapter to transform the css helper call to a StyleX call.

// Simulated theme helpers
const color = (name: string) => (props: { theme: unknown }) => `var(--${name})`;

const primaryStyles = css`
  background-color: ${color("controlPrimary")};
  color: ${color("controlLabel")};
`;

const Button = styled.button`
  padding: 8px 16px;
  border-radius: 4px;
  ${primaryStyles}
`;

export const App = () => <Button>Click me</Button>;
