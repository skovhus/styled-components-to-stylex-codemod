import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <div sx={styles.thing}>First (blue)</div>
    <div sx={[styles.thing, styles.thingAdjacentSibling]}>Second (red, lime - adjacent)</div>
    <span>Spacer</span>
    <div sx={styles.thing}>Third (blue - not adjacent to Thing)</div>
    <div sx={[styles.thing, styles.thingAdjacentSibling]}>Fourth (red, lime - adjacent)</div>
    <div>First row</div>
    <div sx={styles.rowAdjacentSibling}>Second row (margin-top)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "blue",
    paddingBlock: 8,
    paddingInline: 16,
  },
  thingAdjacentSibling: {
    color: "red",
    backgroundColor: "lime",
  },
  rowAdjacentSibling: {
    marginTop: 16,
  },
});
