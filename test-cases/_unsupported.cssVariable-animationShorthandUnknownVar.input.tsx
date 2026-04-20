// @expected-warning: animation shorthand contains a var() with no classifiable fallback — its longhand position cannot be determined statically; bind the variable to a specific longhand (e.g. animation-duration: var(--x)) instead
// var() inside an animation shorthand with no classifiable fallback type is
// unsupported because we cannot statically determine which longhand position
// it should map to (could be duration, timing-function, etc. at runtime).
// Coercing it would miscompile cases like `--anim-token: ease-in` where the
// browser would treat the following `2s` as the duration.
import styled, { keyframes } from "styled-components";

const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
`;

const Ambiguous = styled.div`
  width: 40px;
  height: 40px;
  background-color: lavender;
  animation: ${pulse} var(--anim-token) 2s infinite;
`;

export const App = () => <Ambiguous>Amb</Ambiguous>;
