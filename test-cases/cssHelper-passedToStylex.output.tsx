import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { scrollFadeMaskStyles, helpers } from "./lib/helpers.stylex";

// Pattern 1: css helper used alongside regular CSS properties
function Container(props: React.PropsWithChildren<{}>) {
  return (
    <div sx={[styles.container, scrollFadeMaskStyles(18, "both"), styles.containerAfter1]}>
      {props.children}
    </div>
  );
}

// Pattern 2: css helper as the only interpolation
function FadeBox(props: React.PropsWithChildren<{}>) {
  return <div sx={scrollFadeMaskStyles(24, "bottom")}>{props.children}</div>;
}

// Pattern 3: Multiple css helpers
function ComplexFade(props: React.PropsWithChildren<{}>) {
  return (
    <div
      sx={[
        styles.complexFade,
        scrollFadeMaskStyles(12, "top"),
        styles.complexFadeAfter1,
        scrollFadeMaskStyles(12, "bottom"),
      ]}
    >
      {props.children}
    </div>
  );
}

// Pattern 4: Helper with overlapping property — the static display:block after the helper
// must override flexCenter's display:flex. If cascade order is wrong, children would be
// centered (flex) instead of stacking normally (block), producing a visible pixel diff.
function OverrideDisplay(props: React.PropsWithChildren<{}>) {
  return (
    <div sx={[styles.overrideDisplay, helpers.flexCenter, styles.overrideDisplayAfter1]}>
      {props.children}
    </div>
  );
}

export const App = () => (
  <>
    <Container>
      <p>Content with fade mask on both sides</p>
    </Container>
    <FadeBox>
      <p>Content with bottom fade</p>
    </FadeBox>
    <ComplexFade>
      <p>Complex fade example</p>
    </ComplexFade>
    <OverrideDisplay>
      <span style={{ background: "coral", padding: 4 }}>A</span>
      <span style={{ background: "gold", padding: 4 }}>B</span>
    </OverrideDisplay>
  </>
);

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
  },
  containerAfter1: {
    padding: "16px",
  },
  complexFade: {
    position: "relative",
  },
  complexFadeAfter1: {
    backgroundColor: "white",
  },
  overrideDisplay: {
    backgroundColor: "lightblue",
    padding: "16px",
  },
  overrideDisplayAfter1: {
    display: "block",
  },
});
