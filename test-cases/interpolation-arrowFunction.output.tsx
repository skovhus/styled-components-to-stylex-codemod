import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type GradientBoxProps = { direction?: "horizontal" | "vertical" } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// Arrow function in background (10 occurrences)
function GradientBox(props: GradientBoxProps) {
  const { children, direction } = props;
  return (
    <div
      sx={[styles.gradientBox, direction === "horizontal" && styles.gradientBoxDirectionHorizontal]}
    >
      {children}
    </div>
  );
}

type TabItemProps = React.PropsWithChildren<{
  isActive?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}>;

// Arrow function in border-bottom (6 occurrences)
function TabItem(props: TabItemProps) {
  const { isActive, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[styles.tabItem, isActive ? styles.tabItemActive : styles.tabItemNotActive]}
    />
  );
}

type BlockBodyBoxProps = React.PropsWithChildren<{
  large?: boolean;
  sx?: stylex.StyleXStyles;
  style?: React.CSSProperties;
}>;

// Arrow function with block body (contains comment)
function BlockBodyBox(props: BlockBodyBoxProps) {
  const { children, style, sx, large } = props;
  return (
    <div
      {...mergedSx([styles.blockBodyBox, large && styles.blockBodyBoxLarge, sx], undefined, style)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <GradientBox direction="horizontal">Horizontal Gradient</GradientBox>
    <TabItem isActive>Active Tab</TabItem>
    <TabItem>Inactive Tab</TabItem>
    <div style={{ position: "relative", height: "200px" }}>
      <BlockBodyBox large>Large Box (bottom: 80px)</BlockBodyBox>
      <BlockBodyBox style={{ left: 200 }}>Small Box (bottom: 20px)</BlockBodyBox>
    </div>
  </div>
);

const styles = stylex.create({
  gradientBox: {
    backgroundImage: "linear-gradient(180deg, #bf4f74, #3498db)",
    padding: 24,
  },
  gradientBoxDirectionHorizontal: {
    backgroundImage: "linear-gradient(90deg, #bf4f74, #3498db)",
  },
  tabItem: {
    paddingBlock: 12,
    paddingInline: 16,
    cursor: "pointer",
  },
  tabItemNotActive: {
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "#bf4f74",
  },
  blockBodyBox: {
    position: "absolute",
    left: 10,
    bottom: 20,
    paddingBlock: 12,
    paddingInline: 16,
    backgroundColor: "paleturquoise",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "teal",
  },
  blockBodyBoxLarge: {
    bottom: 80,
  },
});
