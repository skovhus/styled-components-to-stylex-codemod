// Data attributes used as boolean JSX props must accept boolean in the generated type
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

function ListRow(
  props: React.PropsWithChildren<{
    "data-list-row"?: boolean | string;
    "data-selected"?: boolean | string;
  }>,
) {
  const { children, ...rest } = props;

  return (
    <div {...rest} sx={styles.listRow}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8, position: "relative" }}>
      <ListRow data-list-row>
        <span>Row with boolean data attr</span>
      </ListRow>
      <ListRow data-list-row data-selected>
        <span>Row with multiple boolean data attrs</span>
      </ListRow>
      <div data-collapsed-overlay data-collapsed-id="abc" sx={styles.overlay}>
        <span>Overlay</span>
      </div>
    </div>
  );
}

const styles = stylex.create({
  listRow: {
    display: "flex",
    alignItems: "center",
    paddingBlock: 8,
    paddingInline: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#eee",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
});
