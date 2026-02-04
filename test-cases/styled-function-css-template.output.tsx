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
    <div {...stylex.props(styles.borderBox, styles.borderBoxBorderColor("red"))}>Red border</div>
    <div
      {...stylex.props(styles.shadowBox, styles.shadowBoxBoxShadow("0 2px 4px rgba(0,0,0,0.2)"))}
    >
      With shadow
    </div>
    <div {...stylex.props(styles.blockBox, styles.blockBoxWidth("50%"))}>Half width</div>
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

  // Non-destructured props pattern: (props) => css`...${props.color}...`
  borderBox: {
    padding: "8px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "black",
    margin: "4px",
  },
  borderBoxBorderColor: (borderColor: string) => ({
    borderColor,
  }),

  // Non-destructured props with different param name: (p) => css`...${p.color}...`
  shadowBox: {
    padding: "12px",
    boxShadow: "none",
  },
  shadowBoxBoxShadow: (boxShadow: string) => ({
    boxShadow,
  }),

  // Block body with return statement: (props) => { return css`...`; }
  blockBox: {
    display: "block",
    width: "100%",
  },
  blockBoxWidth: (width: string) => ({
    width,
  }),
});
