import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Align = "left" | "right";

type FlexContainerProps = React.PropsWithChildren<{
  $align?: Align;
}>;

// Function call form returning a css template literal (not object syntax)
function FlexContainer(props: FlexContainerProps) {
  const { children, $align } = props;
  return (
    <div
      {...stylex.props(styles.flexContainer, $align === "left" && styles.flexContainerAlignLeft)}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <FlexContainer $align="left">
      <div {...stylex.props(styles.coloredBox, styles.coloredBoxBackgroundColor("lightblue"))}>
        Left aligned
      </div>
      <div {...stylex.props(styles.coloredBox, styles.coloredBoxBackgroundColor("lightgreen"))}>
        Item
      </div>
    </FlexContainer>
    <FlexContainer $align="right">
      <div {...stylex.props(styles.coloredBox)}>Right aligned</div>
    </FlexContainer>
  </div>
);

const styles = stylex.create({
  flexContainer: {
    display: "flex",
    gap: "var(--spacing-xxs)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    position: "relative",
    justifyContent: "flex-end",
  },
  flexContainerAlignLeft: {
    justifyContent: "flex-start",
  },
  coloredBox: {
    padding: "16px",
    backgroundColor: "lightgray",
    borderRadius: "4px",
  },
  coloredBoxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
