// @expected-warning: Unsupported: a property combines a computed at-rule key (from resolveSelector) with a static at-rule key on the same property — StyleX emits computed keys last, so the original cascade order between the at-rules cannot be preserved
// Computed @container at-rule key (resolved via adapter.resolveSelector) combined with a
// dynamic prop-based value and another static at-rule on the SAME property.
//
// This previously crashed with `RangeError: Maximum call stack size exceeded` because the
// @media bucket captured a live reference to the already-wrapped condition map as its
// `default`, producing a `default → self` cycle (now fixed in process-rules).
//
// It still bails: StyleX emits computed at-rule keys (stored in __computedKeys) after the
// static at-rule keys, and breaks same-tier at-rule ties by source order. Here the source
// order is @container (2nd) then @media print (3rd), so appending the computed @container
// key last would let it win over the later @media print width — reversing the original
// cascade. Until the emitter can interleave computed and static at-rule keys by source
// order, the codemod bails rather than emit a silently wrong cascade.
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
