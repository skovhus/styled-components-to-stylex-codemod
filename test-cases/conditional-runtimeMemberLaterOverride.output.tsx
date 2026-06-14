import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

function Box({ children }: { children?: React.ReactNode }) {
  return (
    <div sx={[styles.box, Browser.isTouchDevice ? styles.boxBrowserIsTouchDevice : undefined]}>
      {children}
    </div>
  );
}

// A logical inline shorthand branch partially overridden by a physical side: the
// surviving side is the deterministic physical `margin-right`, so the remainder
// must be emitted physically (not as logical `margin-inline-end`, which targets
// the left side in RTL).
function InlineBox({ children }: { children?: React.ReactNode }) {
  return (
    <div
      sx={[
        styles.inlineBox,
        Browser.isTouchDevice ? styles.inlineBoxBrowserIsTouchDevice : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Box>Later margin-top wins</Box>
    <InlineBox>Later margin-left wins</InlineBox>
  </div>
);

const styles = stylex.create({
  box: {
    marginRight: 12,
    marginLeft: 12,
    marginBottom: 8,
    marginTop: 0,
    backgroundColor: "peachpuff",
  },
  boxBrowserIsTouchDevice: {
    marginRight: 12,
    marginLeft: 12,
    marginBottom: 4,
  },
  inlineBox: {
    marginRight: 4,
    marginLeft: 0,
    backgroundColor: "lightblue",
  },
  inlineBoxBrowserIsTouchDevice: {
    marginRight: 8,
  },
});
