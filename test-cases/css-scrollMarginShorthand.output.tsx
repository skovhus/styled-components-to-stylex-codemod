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
    scrollMargin: "12px",
    backgroundColor: "lightblue",
    padding: "16px",
  },
  // Multi-value shorthand: should expand to block/inline
  card: {
    scrollMarginBlock: "8px",
    scrollMarginInline: "16px",
    scrollPaddingBlock: "4px",
    scrollPaddingInline: "12px",
    backgroundColor: "lightyellow",
    padding: "16px",
  },
  // Four-value shorthand: should expand to directional longhands
  panel: {
    scrollMarginTop: "1px",
    scrollMarginRight: "2px",
    scrollMarginBottom: "3px",
    scrollMarginLeft: "4px",
    backgroundColor: "lightgreen",
    padding: "16px",
  },
  // Single-value scroll-padding
  container: {
    scrollPadding: "20px",
    backgroundColor: "lavender",
    padding: "16px",
  },
});
