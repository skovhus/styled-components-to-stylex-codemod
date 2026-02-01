// @expected-warning: Conditional `css` block: ternary expressions inside pseudo selectors are not supported
import styled, { css } from "styled-components";

// Test case for ternary conditionals inside pseudo selectors using css helper
// The conditional variant cannot preserve the pseudo selector nesting, so we bail

const OFFSET = 24;

interface Props {
  $collapsed: boolean;
  $enabled: boolean;
}

const Container = styled.div<Props>`
  position: relative;

  ${(props) =>
    props.$enabled
      ? css`
          &:hover {
            left: ${props.$collapsed ? 0 : OFFSET}px;
            opacity: 0.8;
          }
        `
      : ""}
`;

export const App = () => <Container $collapsed={false} $enabled={true} />;
