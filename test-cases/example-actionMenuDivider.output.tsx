// ActionMenuDivider: styled(Flex) where a consumed prop (noMinWidth) is always statically true
// across all call sites. The codemod should bake minWidth:0 into the base style instead of
// creating a single-value variant lookup object.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ActionMenuTextDividerProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
};

function ActionMenuTextDivider(props: ActionMenuTextDividerProps) {
  return (
    <div {...mergedSx(styles.textDividerContainer, props.className, props.style)}>
      <span>{props.text}</span>
    </div>
  );
}

export const App = () => <ActionMenuTextDivider text="Section" />;

const styles = stylex.create({
  textDividerContainer: {
    display: "flex",
    flexDirection: "row",
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
