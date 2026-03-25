import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div data-visible="true" sx={[styles.box, styles.boxVisible]}>
        Visible
      </div>
      <div sx={[styles.box, styles.boxHidden]}>Hidden</div>
      <div aria-checked="true">
        <div sx={[styles.menuItem, styles.menuItemChecked]}>Checked</div>
      </div>
      <div>
        <div sx={[styles.menuItem, styles.menuItemDefault]}>Default</div>
      </div>
      <div data-active="true">
        <div sx={styles.indicator}>Active</div>
      </div>
      <div data-state="active" data-size="lg">
        <div sx={styles.compoundItem}>Compound</div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  box: {
    opacity: {
      default: 0,
      ':is([data-visible="true"])': 1,
    },
    transition: "opacity 0.2s",
  },
  // Comma-separated ancestor attribute selectors
  menuItem: {
    opacity: {
      default: 0.5,
      [stylex.when.ancestor(':is([aria-checked="true"])')]: 1,
      [stylex.when.ancestor(':is([data-focused="true"])')]: 1,
      [stylex.when.ancestor(':is([aria-selected="true"])')]: 1,
      [stylex.when.ancestor(':is([aria-checked="mixed"])')]: 1,
    },
    paddingBlock: 8,
    paddingInline: 12,
  },
  // Single ancestor attribute selector (no comma)
  indicator: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(':is([data-active="true"])')]: 1,
    },
    backgroundColor: "lightcyan",
    padding: 10,
  },
  // Compound ancestor attributes (AND — both must be on the same ancestor)
  compoundItem: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(':is([data-state="active"][data-size="lg"])')]: 1,
    },
    backgroundColor: "thistle",
    padding: 10,
  },
  boxVisible: {
    backgroundColor: "lightblue",
    padding: 20,
  },
  boxHidden: {
    backgroundColor: "lightcoral",
    padding: 20,
  },
  menuItemChecked: {
    backgroundColor: "lightgreen",
  },
  menuItemDefault: {
    backgroundColor: "lightyellow",
  },
});
