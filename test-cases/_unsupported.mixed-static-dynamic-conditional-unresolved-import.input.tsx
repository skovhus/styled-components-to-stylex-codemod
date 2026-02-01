// @expected-warning: Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)
import styled, { css } from "styled-components";
import { UNKNOWN_CONSTANT } from "./lib/helpers";

// Test case for ternary conditionals with imported values that can't be resolved
// The adapter returns undefined for UNKNOWN_CONSTANT (not in its known list), so we bail

interface Props {
  $collapsed: boolean;
  $enabled: boolean;
}

const Container = styled.div<Props>`
  display: flex;

  ${(props) =>
    props.$enabled
      ? css`
          position: absolute;
          left: ${props.$collapsed ? 0 : UNKNOWN_CONSTANT}px;
        `
      : ""}
`;

export const App = () => <Container $collapsed={false} $enabled={true} />;
