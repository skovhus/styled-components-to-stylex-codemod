import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export const Divider = (props: { style?: React.CSSProperties }) => {
  return <DividerContainer role="separator" style={props.style} />;
};

// Multiple static properties on the same component
Divider.HEIGHT = 10;
Divider.WIDTH = 200;
Divider.BG_COLOR = "#e0e0e0";

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
    /* NOTE: Inlined Divider.HEIGHT as StyleX requires it to be statically evaluable */
    height: "10px",
    /* NOTE: Inlined Divider.WIDTH as StyleX requires it to be statically evaluable */
    width: "200px",
    /* NOTE: Inlined Divider.BG_COLOR as StyleX requires it to be statically evaluable */
    backgroundColor: "#e0e0e0",
  },
});
