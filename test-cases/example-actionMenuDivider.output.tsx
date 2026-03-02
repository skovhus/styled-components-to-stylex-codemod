// ActionMenuDivider: styled(Flex) where a consumed prop (noMinWidth) is always statically true
// across all call sites. The codemod should bake minWidth:0 into the base style instead of
// creating a single-value variant lookup object.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function TextDividerContainer(
  props: React.PropsWithChildren<{
    className?: string;
    style?: React.CSSProperties;
  }>,
) {
  const { className, children, style } = props;

  return <div {...mergedSx(styles.textDividerContainer, className, style)}>{children}</div>;
}

type ActionMenuTextDividerProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
};

function ActionMenuTextDivider(props: ActionMenuTextDividerProps) {
  return (
    <TextDividerContainer className={props.className} style={props.style}>
      <span>{props.text}</span>
    </TextDividerContainer>
  );
}

export const App = () => <ActionMenuTextDivider text="Section" />;

const styles = stylex.create({
  textDividerContainer: {
    display: "flex",
    minWidth: "0px",
    userSelect: "none",
    height: "30px",
    paddingTop: "4px",
    paddingRight: "12px",
    paddingBottom: "0px",
    paddingLeft: "14px",
    alignItems: "center",
  },
});
