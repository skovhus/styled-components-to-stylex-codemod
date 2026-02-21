import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

export function App() {
  return (
    <>
      <Sentence>Test</Sentence>
      <PaddedMutedSentence style={{ marginBottom: 0 }}>Test</PaddedMutedSentence>
      <PaddedSentence>Okay</PaddedSentence>
    </>
  );
}
App.displayName = "App";

function Sentence<C extends React.ElementType = "div">(
  props: React.ComponentProps<"div"> & { as?: C },
) {
  const { as: Component = "div", className, children, style } = props;

  return <Component {...mergedSx(styles.sentence, className, style)}>{children}</Component>;
}

function PaddedSentence(props: React.ComponentPropsWithRef<typeof Sentence>) {
  const { className, children, style, ...rest } = props;

  return (
    <Sentence {...rest} {...mergedSx(styles.paddedSentence, className, style)}>
      {children}
    </Sentence>
  );
}

function PaddedMutedSentence(
  props: Omit<React.ComponentPropsWithRef<typeof PaddedSentence>, "className">,
) {
  const { children, style, ...rest } = props;

  return (
    <PaddedSentence {...rest} {...mergedSx(styles.paddedMutedSentence, undefined, style)}>
      {children}
    </PaddedSentence>
  );
}

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
  },
});
