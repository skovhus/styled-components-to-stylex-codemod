import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 12 }}>
    <div sx={styles.box}>Vendor box</div>
    <input type="range" sx={styles.slider} />
  </div>
);

const styles = stylex.create({
  box: {
    WebkitAppearance: "textfield",
    appearance: "none",
    width: 120,
    height: 40,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#555",
    backgroundColor: "#eef",
  },
  slider: {
    "::-webkit-slider-thumb": {
      width: 10,
    },
  },
});
