// @expected-warning: Theme value with fallback (props.theme.X ?? / || default) cannot be resolved statically — use adapter.resolveValue to map theme paths to StyleX tokens
import styled from "styled-components";

// Unsupported: logical expression with theme value fallback (??/||) cannot be
// preserved as an inline style because props.theme is not available at runtime.

const Box = styled.div`
  color: ${(props) => props.theme.color.labelBase ?? "black"};
`;

export const App = () => <Box />;
