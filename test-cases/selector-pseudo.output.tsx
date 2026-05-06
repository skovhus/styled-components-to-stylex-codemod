import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div data-label=" after" sx={styles.thing}>
      Hover me!
    </div>
    <div sx={[styles.focusableCellAnimating, styles.focusableCell]}>
      <button type="button">Focusable cell</button>
    </div>
  </div>
);

const styles = stylex.create({
  thing: {
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "hotpink",
    color: {
      default: "blue",
      ":hover": "red",
    },
    outline: {
      default: null,
      ":focus": "2px solid blue",
    },
    "::before": {
      content: '"🔥"',
    },
    "::after": {
      content: "attr(data-label)",
    },
  },
  focusableCell: {
    position: "relative",
    zIndex: {
      default: null,
      ":focus-within": 12,
    },
  },
  focusableCellAnimating: {
    zIndex: 10,
  },
});
