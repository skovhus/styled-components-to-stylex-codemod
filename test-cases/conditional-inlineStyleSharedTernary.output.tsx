// Dynamic inline style objects on intrinsic styled components should stay as JSX style props.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const InputRow = ({ hasRange }: { hasRange: boolean }) => (
  <input
    defaultValue={hasRange ? "hasRange" : "no range"}
    sx={styles.input}
    style={{
      width: hasRange ? 48 : "100%",
      cursor: hasRange ? "text" : "ew-resize",
      textAlign: hasRange ? "right" : "left",
    }}
  />
);

// Deterministic at runtime so input/output renders match pixel-for-pixel.
const isImpureFlag = () => true;
const ImpureRow = () => (
  <div
    sx={styles.impureBox}
    style={{
      width: isImpureFlag() ? 48 : 96,
      color: isImpureFlag() ? "red" : "blue",
    }}
  >
    call
  </div>
);

const ActiveRow = ({ active }: { active: boolean }) => (
  <>
    <div
      sx={styles.box}
      style={{
        width: active ? 40 : 80,
        height: active ? 40 : 20,
      }}
    >
      box
    </div>
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
  },
  // Preserving dynamic style props keeps per-property expression evaluation
  // semantics for impure conditions.
  impureBox: {
    padding: 8,
  },
  // Preserving the caller style avoids generating extra keys that can collide
  // with unrelated styled components.
  box: {
    padding: 4,
  },
  boxActive: {
    backgroundColor: "yellow",
  },
});
