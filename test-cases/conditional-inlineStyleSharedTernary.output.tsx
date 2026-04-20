// Inline style object with multiple properties sharing the same ternary condition.
// Should hoist into a static base style + boolean-conditional variant style instead
// of emitting a single dynamic function with N ternary call args.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const InputRow = ({ hasRange }: { hasRange: boolean }) => (
  <input
    defaultValue={hasRange ? "hasRange" : "no range"}
    sx={[styles.input, hasRange && styles.inputHasRange]}
  />
);

// Deterministic at runtime so input/output renders match pixel-for-pixel, but
// still a `CallExpression` at AST analysis time so the purity check trips and
// the codemod falls back to the per-property dynamic style function.
const isImpureFlag = () => true;
const ImpureRow = () => (
  <div sx={styles.impureBox(isImpureFlag() ? 48 : 96, isImpureFlag() ? "red" : "blue")}>call</div>
);

const ActiveRow = ({ active }: { active: boolean }) => (
  <>
    <div sx={[styles.box, active && styles.boxActive2]}>box</div>
    <div sx={styles.boxActive}>active marker</div>
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

const styles = stylex.create({
  input: {
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    paddingBlock: 4,
    paddingInline: 8,
    width: "100%",
    cursor: "ew-resize",
    textAlign: "left",
  },
  // A shared ternary whose test is a function call. Promotion must NOT collapse
  // the per-property ternaries here: hoisting to a single `cond && styles.x` would
  // evaluate the call only once instead of once-per-property and can apply a
  // different branch than the original inline style object when the call returns
  // a different value each time (e.g. `Math.random()` based logic, time-based
  // flags, side-effecting getters).
  impureBox: (width: number | string, color: string) => ({
    padding: 8,
    width,
    color,
  }),
  // A shared-ternary promotion for `<Box>` would generate the key
  // `${box}${Active}` = `boxActive`, which collides with the unrelated styled
  // component `BoxActive` already registered under that key. The promoted entry
  // must be deduplicated against existing style keys so it doesn't silently
  // overwrite `BoxActive`'s style.
  box: {
    padding: 4,
    width: 80,
    height: 20,
  },
  boxActive: {
    backgroundColor: "yellow",
  },
  inputHasRange: {
    width: 48,
    cursor: "text",
    textAlign: "right",
  },
  boxActive2: {
    width: 40,
    height: 40,
  },
});
