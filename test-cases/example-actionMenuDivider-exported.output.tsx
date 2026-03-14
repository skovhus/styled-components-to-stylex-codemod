// ActionMenuDivider: exported styled(Flex) where noMinWidth is always passed at local call sites.
// The adapter returns { styles: false, as: false } for this component, so it has no external
// interface. Singleton folding is safe — noMinWidth is baked into the base style with narrow props.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export function TextDividerContainer(
  props: Pick<React.ComponentProps<"div">, "className" | "style" | "ref" | "children">,
) {
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
    <TextDividerContainer className={props.className} style={props.style}>
      <span>{props.text}</span>
    </TextDividerContainer>
  );
}

export const App = () => <ActionMenuTextDivider text="Section" />;

const styles = stylex.create({
  textDividerContainer: {
    display: "flex",
    flexDirection: "row",
    minWidth: 0,
    userSelect: "none",
    height: 30,
    paddingTop: 4,
    paddingRight: 12,
    paddingBottom: 0,
    paddingLeft: 14,
    alignItems: "center",
  },
});
