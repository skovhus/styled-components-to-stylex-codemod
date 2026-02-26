import * as React from "react";
import styled from "styled-components";
import { scrollFadeMaskStyles, flexCenter } from "./lib/helpers";

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

// Pattern 4: Helper with overlapping property — the static display:block after the helper
// must override flexCenter's display:flex. If cascade order is wrong, children would be
// centered (flex) instead of stacking normally (block), producing a visible pixel diff.
const OverrideDisplay = styled.div`
  background-color: lightblue;
  padding: 16px;
  ${flexCenter()}
  display: block;
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
    <OverrideDisplay>
      <span style={{ background: "coral", padding: 4 }}>A</span>
      <span style={{ background: "gold", padding: 4 }}>B</span>
    </OverrideDisplay>
  </>
);
