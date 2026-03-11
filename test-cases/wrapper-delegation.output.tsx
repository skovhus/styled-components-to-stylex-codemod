import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export function App() {
  return (
    <>
      <div sx={styles.sentence}>Test</div>
      <div sx={[styles.sentence, styles.paddedSentence, styles.paddedMutedSentence]}>Test</div>
      <div sx={[styles.sentence, styles.paddedSentence]}>Okay</div>
    </>
  );
}
App.displayName = "App";

const styles = stylex.create({
  sentence: {
    textAlign: "center",
    marginBottom: "32px",
  },
  paddedSentence: {
    paddingBlock: 0,
    paddingInline: "32px",
  },
  paddedMutedSentence: {
    color: $colors.labelMuted,
    marginBottom: 0,
  },
});
