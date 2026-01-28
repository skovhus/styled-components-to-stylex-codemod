import styled from "styled-components";
import { screenSize } from "./lib/helpers";

/**
 * This test case uses a media query helper (screenSize.phone) that resolves
 * to a media query string. The adapter's resolveSelector handles this by
 * returning a computed key expression (breakpoints.phone) for StyleX.
 *
 * It also tests that standard @media rules and selector-interpolated helpers
 * can coexist on the same property without one overwriting the other.
 */
const Container = styled.div`
  width: 100%;
  padding: 1rem;

  /* Standard @media rule */
  @media (min-width: 1024px) {
    padding: 2rem;
  }

  /* Selector-interpolated media query helper */
  ${screenSize.phone} {
    padding: 0.5rem;
  }
`;

export const App = () => <Container>Responsive container</Container>;
