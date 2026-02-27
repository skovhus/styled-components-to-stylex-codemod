// ActionMenuDivider: styled(Flex) where a consumed prop (noMinWidth) is always statically true
// across all call sites. The codemod should bake minWidth:0 into the base style instead of
// creating a single-value variant lookup object.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type TextDividerContainerProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
  noMinWidth?: any;
}>;

function TextDividerContainer(props: TextDividerContainerProps) {
  const { className, children, style, ...rest } = props;

  return (
    <div {...rest} {...mergedSx(styles.textDividerContainer, className, style)}>
      {children}
    </div>
  );
}

type ActionMenuTextDividerProps = {
  text: string;
  className?: string;
  style?: React.CSSProperties;
};

function ActionMenuTextDivider(props: ActionMenuTextDividerProps) {
  return (
    <TextDividerContainer noMinWidth className={props.className} style={props.style}>
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
