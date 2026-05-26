// Private styled element passed to a local elementType-like prop should keep a broad value surface.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function InnerContainer(props: React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles }) {
  const { className, children, style, sx, ...rest } = props;
  return (
    <div {...rest} {...mergedSx([styles.innerContainer, sx], className, style)}>
      {children}
    </div>
  );
}

function FixedSizeList(props: { innerElementType?: React.ElementType; children: React.ReactNode }) {
  const Inner = props.innerElementType ?? "div";
  return (
    <Inner
      ref={React.createRef<HTMLDivElement>()}
      style={{ height: 120, width: "100%", position: "relative" }}
    >
      {props.children}
    </Inner>
  );
}

export const App = () => (
  <FixedSizeList innerElementType={InnerContainer}>
    <div style={{ padding: 8 }}>Row</div>
  </FixedSizeList>
);

const styles = stylex.create({
  innerContainer: {
    position: "relative",
    backgroundColor: "#eef8ff",
    padding: 4,
  },
});
