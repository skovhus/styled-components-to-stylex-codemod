import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { scrollFadeMaskStyles } from "./lib/helpers";

/**
 * BUG: When a styled-component uses a css helper function as an interpolation,
 * the codemod passes the result directly to stylex.props(). But the css helper
 * returns a styled-components RuleSet<object>, not a StyleX style. This causes TS2345.
 */

// Pattern 1: css helper used alongside regular CSS properties
function Container(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(styles.container, scrollFadeMaskStyles(18))}>{children}</div>;
}

// Pattern 2: css helper as the only interpolation
function FadeBox(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(scrollFadeMaskStyles(18))}>{children}</div>;
}

// Pattern 3: Multiple css helpers
function ComplexFade(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return (
    <div {...stylex.props(styles.complexFade, scrollFadeMaskStyles(18), scrollFadeMaskStyles(18))}>
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
  },
});
