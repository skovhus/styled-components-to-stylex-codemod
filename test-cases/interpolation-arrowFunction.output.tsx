import React from "react";
import * as stylex from "@stylexjs/stylex";

type GradientBoxProps = {
  children?: React.ReactNode;
  $direction?: "horizontal" | "vertical";
};

// Arrow function in background (10 occurrences)
function GradientBox(props: GradientBoxProps) {
  const { children, $direction } = props;

  return (
    <div
      {...stylex.props(
        styles.gradientBox,
        $direction === "horizontal" && styles.gradientBoxDirectionHorizontal,
      )}
    >
      {children}
    </div>
  );
}

type TabItemProps = {
  ref?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
  $isActive?: boolean;
};

// Arrow function in border-bottom (6 occurrences)
function TabItem(props: TabItemProps) {
  const { children, $isActive, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(styles.tabItem, $isActive ? styles.tabItemActive : styles.tabItemNotActive)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <GradientBox $direction="horizontal">Horizontal Gradient</GradientBox>
    <TabItem $isActive>Active Tab</TabItem>
    <TabItem>Inactive Tab</TabItem>
  </div>
);

const styles = stylex.create({
  gradientBox: {
    backgroundImage: "linear-gradient(180deg, #bf4f74, #3498db)",
    padding: "24px",
  },
  gradientBoxDirectionHorizontal: {
    backgroundImage: "linear-gradient(90deg, #bf4f74, #3498db)",
  },
  tabItem: {
    paddingBlock: "12px",
    paddingInline: "16px",
    cursor: "pointer",
  },
  tabItemNotActive: {
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "#bf4f74",
  },
});
