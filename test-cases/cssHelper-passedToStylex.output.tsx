import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { scrollFadeMaskStyles, helpers } from "./lib/helpers.stylex";

export const App = () => (
  <>
    <div sx={[styles.container, scrollFadeMaskStyles(18, "both"), styles.containerAfter1]}>
      <p>Content with fade mask on both sides</p>
    </div>
    <div sx={scrollFadeMaskStyles(24, "bottom")}>
      <p>Content with bottom fade</p>
    </div>
    <div
      sx={[
        styles.complexFade,
        scrollFadeMaskStyles(12, "top"),
        styles.complexFadeAfter1,
        scrollFadeMaskStyles(12, "bottom"),
      ]}
    >
      <p>Complex fade example</p>
    </div>
    <div sx={[styles.overrideDisplay, helpers.flexCenter, styles.overrideDisplayAfter1]}>
      <span style={{ background: "coral", padding: 4 }}>A</span>
      <span style={{ background: "gold", padding: 4 }}>B</span>
    </div>
  </>
);

const styles = stylex.create({
  // Pattern 1: css helper used alongside regular CSS properties
  container: {
    display: "flex",
    flexDirection: "column",
  },

  containerAfter1: {
    padding: 16,
  },

  // Pattern 3: Multiple css helpers
  complexFade: {
    position: "relative",
  },

  complexFadeAfter1: {
    backgroundColor: "white",
  },

  // Pattern 4: Helper with overlapping property — the static display:block after the helper
  // must override flexCenter's display:flex. If cascade order is wrong, children would be
  // centered (flex) instead of stacking normally (block), producing a visible pixel diff.
  overrideDisplay: {
    backgroundColor: "lightblue",
    padding: 16,
  },

  overrideDisplayAfter1: {
    display: "block",
  },
});
