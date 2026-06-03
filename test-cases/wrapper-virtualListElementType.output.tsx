// Private styled elements passed to element-type props. A style-only host (forwards only `style`)
// gets the narrow style-only wrapper; a host that forwards `className` must keep the broad
// className-merging wrapper so the host className is not overwritten.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function InnerContainer(
  props: React.PropsWithChildren<{
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
  }>,
) {
  const { style, ...rest } = props;
  return <div {...rest} {...mergedSx(styles.innerContainer, undefined, style)} />;
}

function ClassyRow(props: React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles }) {
  const { className, style, sx, ...rest } = props;
  return <div {...rest} {...mergedSx([styles.classyRow, sx], className, style)} />;
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

// Forwards `className` to the element-type slot, so ClassyRow must keep a broad wrapper.
function ClassyList(props: { innerElementType?: React.ElementType; children: React.ReactNode }) {
  const Inner = props.innerElementType ?? "div";
  return (
    <Inner className="classy-row" style={{ width: "100%" }}>
      {props.children}
    </Inner>
  );
}

export const App = () => (
  <div>
    <FixedSizeList innerElementType={InnerContainer}>
      <div style={{ padding: 8 }}>Row</div>
    </FixedSizeList>
    <ClassyList innerElementType={ClassyRow}>
      <div style={{ padding: 8 }}>Classy Row</div>
    </ClassyList>
  </div>
);

const styles = stylex.create({
  innerContainer: {
    position: "relative",
    backgroundColor: "#eef8ff",
    padding: 4,
  },
  classyRow: {
    backgroundColor: "#ffe8cc",
    padding: 4,
  },
});
