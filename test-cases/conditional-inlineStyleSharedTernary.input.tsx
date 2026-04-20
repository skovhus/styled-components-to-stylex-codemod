// Inline style object with multiple properties sharing the same ternary condition.
// Should hoist into a static base style + boolean-conditional variant style instead
// of emitting a single dynamic function with N ternary call args.
import * as React from "react";
import styled from "styled-components";

const Input = styled.input`
  font-size: 14px;
  border: 1px solid #ccc;
  padding: 4px 8px;
`;

const InputRow = ({ hasRange }: { hasRange: boolean }) => (
  <Input
    style={{
      width: hasRange ? 48 : "100%",
      cursor: hasRange ? "text" : "ew-resize",
      textAlign: hasRange ? "right" : "left",
    }}
    defaultValue={hasRange ? "hasRange" : "no range"}
  />
);

// A shared ternary whose test is a function call. Promotion must NOT collapse
// the per-property ternaries here: hoisting to a single `cond && styles.x` would
// evaluate the call only once instead of once-per-property and can apply a
// different branch than the original inline style object when the call returns
// a different value each time (e.g. `Math.random()` based logic, time-based
// flags, side-effecting getters).
const ImpureBox = styled.div`
  padding: 8px;
`;
// Deterministic at runtime so input/output renders match pixel-for-pixel, but
// still a `CallExpression` at AST analysis time so the purity check trips and
// the codemod falls back to the per-property dynamic style function.
const isImpureFlag = () => true;
const ImpureRow = () => (
  <ImpureBox
    style={{
      width: isImpureFlag() ? 48 : 96,
      color: isImpureFlag() ? "red" : "blue",
    }}
  >
    call
  </ImpureBox>
);

// A shared-ternary promotion for `<Box>` would generate the key
// `${box}${Active}` = `boxActive`, which collides with the unrelated styled
// component `BoxActive` already registered under that key. The promoted entry
// must be deduplicated against existing style keys so it doesn't silently
// overwrite `BoxActive`'s style.
const Box = styled.div`
  padding: 4px;
`;
const BoxActive = styled.div`
  background: yellow;
`;
const ActiveRow = ({ active }: { active: boolean }) => (
  <>
    <Box
      style={{
        width: active ? 40 : 80,
        height: active ? 40 : 20,
      }}
    >
      box
    </Box>
    <BoxActive>active marker</BoxActive>
  </>
);

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <InputRow hasRange={true} />
    <InputRow hasRange={false} />
    <ImpureRow />
    <ActiveRow active={true} />
  </div>
);
