// ActionMenuDivider: exported styled(Flex) where noMinWidth is always passed at local call sites.
// Because the component is exported, external callers may omit or vary the prop, so singleton
// folding must NOT bake it into the base style — it should remain a variant.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type TextDividerContainerProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
  noMinWidth?: any;
}>;

export function TextDividerContainer(props: TextDividerContainerProps) {
  const { className, children, style, noMinWidth, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.textDividerContainer,
          noMinWidth != null &&
            textDividerContainerNoMinWidthVariants[
              noMinWidth as keyof typeof textDividerContainerNoMinWidthVariants
            ],
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

export const App = () => <ActionMenuTextDivider text="Section" />;

const styles = stylex.create({
  textDividerContainer: {
    display: "flex",
    userSelect: "none",
    height: "30px",
    paddingTop: "4px",
    paddingRight: "12px",
    paddingBottom: "0px",
    paddingLeft: "14px",
    alignItems: "center",
  },
});

const textDividerContainerNoMinWidthVariants = stylex.create({
  true: {
    minWidth: "0px",
  },
});
