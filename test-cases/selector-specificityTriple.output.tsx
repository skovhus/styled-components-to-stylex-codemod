import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <div sx={styles.thing}>Should be blue (&&& wins over && by source order)</div>
  </div>
);

const styles = stylex.create({
  // Triple ampersand &&& is stripped and emitted in source order with a validation TODO.
  thing: {
    // TODO: Specificity hack stripped, carefully test (was: &&&)
    color: "blue",
  },
});
