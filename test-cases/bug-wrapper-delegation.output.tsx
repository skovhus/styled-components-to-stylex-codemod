import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

export function App() {
  return (
    <>
      <PaddedMutedSentence style={{ marginBottom: 0 }}>Test</PaddedMutedSentence>
      <PaddedSentence>Okay</PaddedSentence>
    </>
  );
}

App.displayName = "App";

type PaddedSentenceProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
  as?: React.ElementType;
}>;

function PaddedSentence(props: PaddedSentenceProps) {
  const { as: Component = "div", className, children, style } = props;
  return (
    <Component {...mergedSx([styles.sentence, styles.paddedSentence], className, style)}>
      {children}
    </Component>
  );
}

type PaddedMutedSentenceProps = Omit<
  React.ComponentPropsWithRef<typeof PaddedSentence>,
  "className"
>;

function PaddedMutedSentence(props: PaddedMutedSentenceProps) {
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
