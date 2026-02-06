import * as React from "react";
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

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
