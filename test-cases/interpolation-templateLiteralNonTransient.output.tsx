import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = React.PropsWithChildren<{
  size?: number;
}>;

// Template literal with non-transient props should emit StyleX style functions.
// These are props without the $ prefix that are used in template literal interpolations.

function Box(props: BoxProps) {
  const { children, size } = props;
  return <div sx={[styles.box, styles.boxWidth(size), styles.boxHeight(size)]}>{children}</div>;
}

type FrameProps = React.PropsWithChildren<{
  svgWidth?: number;
  svgHeight?: number;
}>;

function Frame(props: FrameProps) {
  const { children, svgWidth, svgHeight } = props;
  return (
    <div
      sx={[styles.frame, styles.frameWidth(svgWidth), styles.frameAspectRatio(svgWidth, svgHeight)]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Box size={150}>150x150</Box>
    <Box size={100}>100x100</Box>
    <Box>Default (100x100)</Box>
    <Frame svgWidth={160} svgHeight={90}>
      16:9 frame
    </Frame>
    <Frame>Default frame</Frame>
  </div>
);

function getAspectRatio(svgWidth?: number, svgHeight?: number): string {
  return svgWidth && svgHeight ? `${svgWidth} / ${svgHeight}` : "16 / 9";
}

const styles = stylex.create({
  box: {
    padding: 8,
    backgroundColor: "paleturquoise",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "teal",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: 8,
  },
  boxWidth: (size: number | undefined) => ({
    width: `${size ?? 100}px`,
  }),
  boxHeight: (size: number | undefined) => ({
    height: `${size ?? 100}px`,
  }),
  frame: {
    backgroundColor: "mistyrose",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "crimson",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  frameWidth: (svgWidth: number | undefined) => ({
    width: svgWidth ? `${svgWidth}px` : "100%",
  }),
  frameAspectRatio: (svgWidth: number | undefined, svgHeight: number | undefined) => ({
    aspectRatio: getAspectRatio(svgWidth, svgHeight),
  }),
});
