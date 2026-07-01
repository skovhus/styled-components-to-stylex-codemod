import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { scrollFadeMaskStyles, helpers } from "./lib/helpers.stylex";
import { Browser } from "./lib/helpers";

// Pattern 5: Runtime unit branch after a resolved StyleX helper must stay after
// the helper in sx ordering so the false branch preserves CSS cascade order.
function RuntimeAfterHelper({ children }: { children?: React.ReactNode }) {
  return (
    <div
      sx={[
        styles.runtimeAfterHelper,
        helpers.flexCenter,
        styles.runtimeAfterHelperAfter1,
        Browser.isTouchDevice ? styles.runtimeAfterHelperBrowserIsTouchDevice : undefined,
      ]}
    >
      {children}
    </div>
  );
}

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
    <RuntimeAfterHelper>
      <span style={{ background: "white", padding: 4 }}>Runtime after helper</span>
    </RuntimeAfterHelper>
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
  runtimeAfterHelper: {
    position: "relative",
  },
  runtimeAfterHelperAfter1: {
    top: 1,
    backgroundColor: "lavender",
  },
  runtimeAfterHelperBrowserIsTouchDevice: {
    top: 5,
  },
});
