import styled from "styled-components";
import { screenSize } from "./lib/helpers";

/**
 * This test case uses a media query helper (screenSize.phone) that resolves
 * to a media query string. The adapter's resolveSelector handles this by
 * returning a computed key expression (breakpoints.phone) for StyleX.
 */
const Container = styled.div`
  width: 100%;
  padding: 1rem;

  ${screenSize.phone} {
    padding: 0.5rem;
  }
`;

export const App = () => <Container>Responsive container</Container>;
