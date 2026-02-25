import React from "react";
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

function Sentence(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(styles.sentence)}>{children}</div>;
}

function PaddedSentence(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return <div {...stylex.props(styles.sentence, styles.paddedSentence)}>{children}</div>;
}

function PaddedMutedSentence(
  props: React.PropsWithChildren<{
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { children, style } = props;

  return (
    <div
      {...mergedSx(
        [styles.sentence, styles.paddedSentence, styles.paddedMutedSentence],
        undefined,
        style,
      )}
    >
      {children}
    </div>
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
