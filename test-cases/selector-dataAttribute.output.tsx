import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div data-visible="true" sx={[styles.box, styles.boxVisible]}>
        Visible
      </div>
      <div sx={[styles.box, styles.boxHidden]}>Hidden</div>
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
  boxVisible: {
    backgroundColor: "lightblue",
    padding: 20,
  },
  boxHidden: {
    backgroundColor: "lightcoral",
    padding: 20,
  },
});
