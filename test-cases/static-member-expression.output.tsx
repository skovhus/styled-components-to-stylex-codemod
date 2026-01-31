import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

Divider.HEIGHT = 10;
type DividerContainerProps = Omit<React.ComponentProps<"div">, "className">;

function DividerContainer(props: DividerContainerProps) {
  const { children, style, ...rest } = props;
  return (
    <div {...rest} {...mergedSx(styles.dividerContainer, undefined, style)}>
      {children}
    </div>
  );
}

export function App() {
  return <Divider />;
}

const styles = stylex.create({
  dividerContainer: {
    paddingBlock: "5px",
    paddingInline: 0,
    height: `${10}px`,
  },
});
