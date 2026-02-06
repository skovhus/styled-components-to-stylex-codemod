import * as React from "react";
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

/**
 * BUG: When a styled-component uses a css helper function as an interpolation,
 * the codemod passes the result directly to stylex.props(). But the css helper
 * returns a styled-components RuleSet<object>, not a StyleX style. This causes TS2345.
 */

// Pattern 1: css helper used alongside regular CSS properties
const Container = styled.div`
  display: flex;
  flex-direction: column;
  ${scrollFadeMaskStyles(18, "both")}
  padding: 16px;
`;

// Pattern 2: css helper as the only interpolation
const FadeBox = styled.div`
  ${scrollFadeMaskStyles(24, "bottom")}
`;

// Pattern 3: Multiple css helpers
const ComplexFade = styled.div`
  position: relative;
  ${scrollFadeMaskStyles(12, "top")}
  background: white;
  ${scrollFadeMaskStyles(12, "bottom")}
`;

export const App = () => (
  <>
    <Container>
      <p>Content with fade mask on both sides</p>
    </Container>
    <FadeBox>
      <p>Content with bottom fade</p>
    </FadeBox>
    <ComplexFade>
      <p>Complex fade example</p>
    </ComplexFade>
  </>
);
