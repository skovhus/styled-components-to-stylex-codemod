// Computed @container at-rule key combined with a dynamic prop-based value and another at-rule
// Regression: the same CSS property across a dynamic default, a computed @container key
// (resolved via adapter.resolveSelector), and a static @media branch must not build a
// recursively nested style object (default.default.default...) nor crash with a stack overflow.
import styled from "styled-components";
import { screenSizeBreakPoints } from "./lib/helpers";

export const Panel = styled.div<{ $wide?: boolean }>`
  width: ${(props) => (props.$wide ? "100%" : "calc(100% - 120px)")};
  background-color: #e0f2fe;
  padding: 16px;

  @container panel (max-width: ${screenSizeBreakPoints.phone}px) {
    width: ${(props) => (props.$wide ? "100%" : "calc(100% - 40px)")};
  }

  @media print {
    width: auto;
  }
`;

export const App = () => (
  <div style={{ containerType: "inline-size", display: "flex", gap: "8px" }}>
    <Panel>Default</Panel>
    <Panel $wide>Wide</Panel>
  </div>
);
