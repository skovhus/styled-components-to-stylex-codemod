import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
    <div sx={styles.textContainer}>
      <p>Paragraph in hotpink</p>
      <span>Span in hotpink</span>
    </div>
    <section sx={styles.headingReset}>
      <p>Bold centered</p>
      <div>Also bold centered</div>
    </section>
    <div sx={styles.themedContainer}>
      <span>Themed text</span>
    </div>
  </div>
);

const styles = stylex.create({
  // All inherited properties in & * should merge into base styles
  textContainer: {
    padding: 16,
    backgroundColor: "#f0f0f0",
    color: "hotpink",
    fontFamily: '"Helvetica",sans-serif',
    lineHeight: 1.5,
  },
  // Multiple groups: base + inherited universal
  headingReset: {
    display: "flex",
    gap: 8,
    fontWeight: "bold",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  // Bare * selector with theme interpolation (adapter-resolved)
  themedContainer: {
    padding: 12,
    color: $colors.labelMuted,
    cursor: "pointer",
  },
});
