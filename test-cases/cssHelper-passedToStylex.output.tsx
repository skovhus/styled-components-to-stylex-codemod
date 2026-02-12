import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { scrollFadeMaskStyles } from "./lib/helpers.stylex";

// Pattern 1: css helper used alongside regular CSS properties
function Container(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return (
    <div {...stylex.props(styles.container, scrollFadeMaskStyles(18, "both"))}>{children}</div>
  );
}

// Pattern 2: css helper as the only interpolation
function FadeBox(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(scrollFadeMaskStyles(24, "bottom"))}>{children}</div>;
}

// Pattern 3: Multiple css helpers
function ComplexFade(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return (
    <div
      {...stylex.props(
        styles.complexFade,
        scrollFadeMaskStyles(12, "top"),
        scrollFadeMaskStyles(12, "bottom"),
      )}
    >
      {children}
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
  </>
);

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    padding: "16px",
  },
  complexFade: {
    position: "relative",
    backgroundColor: "white",
    backgroundImage: "none",
  },
});
