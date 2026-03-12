import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <div sx={styles.section}>Single-value scroll-margin</div>
    <div sx={styles.card}>Two-value scroll-margin/padding</div>
    <div sx={styles.panel}>Four-value scroll-margin</div>
    <div sx={styles.container}>Single-value scroll-padding</div>
  </div>
);

const styles = stylex.create({
  // Single-value shorthand: should stay as scrollMargin
  section: {
    scrollMargin: 12,
    backgroundColor: "lightblue",
    padding: 16,
  },
  // Multi-value shorthand: should expand to block/inline
  card: {
    scrollMarginBlock: 8,
    scrollMarginInline: 16,
    scrollPaddingBlock: 4,
    scrollPaddingInline: 12,
    backgroundColor: "lightyellow",
    padding: 16,
  },
  // Four-value shorthand: should expand to directional longhands
  panel: {
    scrollMarginTop: 1,
    scrollMarginRight: 2,
    scrollMarginBottom: 3,
    scrollMarginLeft: 4,
    backgroundColor: "lightgreen",
    padding: 16,
  },
  // Single-value scroll-padding
  container: {
    scrollPadding: 20,
    backgroundColor: "lavender",
    padding: 16,
  },
});
