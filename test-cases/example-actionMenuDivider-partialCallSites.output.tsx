// ActionMenuDivider: noMinWidth is NOT passed at every call site, so it cannot be folded
// into the base style. It becomes a boolean conditional style in the main styles object.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type TextDividerContainerProps = React.PropsWithChildren<{
  noMinWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
}>;

function TextDividerContainer(props: TextDividerContainerProps) {
  const { className, children, style, noMinWidth } = props;

  return (
    <div
      {...mergedSx(
        [
          styles.textDividerContainer,
          noMinWidth ? styles.textDividerContainerNoMinWidth : undefined,
        ],
        className,
        style,
      )}
    >
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

// Second call site without noMinWidth — prevents folding
function ActionMenuTextDividerWide(props: ActionMenuTextDividerProps) {
  return (
    <TextDividerContainer className={props.className} style={props.style}>
      <span>{props.text}</span>
    </TextDividerContainer>
  );
}

export const App = () => (
  <>
    <ActionMenuTextDivider text="Narrow" />
    <ActionMenuTextDividerWide text="Wide" />
  </>
);

const styles = stylex.create({
  textDividerContainer: {
    display: "flex",
    flexDirection: "row",
    userSelect: "none",
    height: "30px",
    paddingTop: "4px",
    paddingRight: "12px",
    paddingBottom: "0px",
    paddingLeft: "14px",
    alignItems: "center",
  },
  textDividerContainerNoMinWidth: {
    minWidth: "0px",
  },
});
