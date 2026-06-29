// Computed @container at-rule key (via adapter.resolveSelector) combined with a dynamic
// prop-based value and a static pseudo on the SAME property.
//
// Regression: the @media/pseudo condition bucket used to capture a live reference to the
// already-wrapped condition map as its `default`, creating a `default → self` cycle that
// crashed with `RangeError: Maximum call stack size exceeded`. The pseudo (`:hover`) sits
// in a different StyleX priority tier than the computed at-rule, so the cascade order is
// preserved regardless of emit order — this case transforms successfully (unlike the
// at-rule-vs-at-rule case, which bails).
import styled from "styled-components";
import { screenSizeBreakPoints } from "./lib/helpers";

export const Box = styled.div<{ $active?: boolean }>`
  color: ${(props) => (props.$active ? "white" : "black")};
  background-color: #1e293b;
  padding: 16px;

  @container panel (max-width: ${screenSizeBreakPoints.phone}px) {
    color: ${(props) => (props.$active ? "yellow" : "gray")};
  }

  &:hover {
    color: red;
  }
`;

export const App = () => (
  <div style={{ containerType: "inline-size", display: "flex", gap: "8px" }}>
    <Box>Default</Box>
    <Box $active>Active</Box>
  </div>
);
