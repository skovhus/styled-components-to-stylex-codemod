// @expected-warning: Arrow function: helper call body is not supported
import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// When conditional branches are arrow functions (not primitives),
// the handler should bail since resolving them as literals changes semantics.
const FnLiteralText = styled.div<{ $flag: boolean }>`
  line-height: 1rem;
  ${
    // @ts-expect-error — intentionally passing arrow fns where number is expected to test bail-out
    ({ $flag }) => truncateMultiline($flag ? () => 1 : () => 2)
  };
`;

export const App = () => (
  <div style={{ padding: "16px" }}>
    <FnLiteralText $flag>Function literal bail</FnLiteralText>
  </div>
);
