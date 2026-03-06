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
    <div sx={[styles.flexContainer, $align === "left" && styles.flexContainerAlignLeft]}>
      {children}
    </div>
  );
}

type ColoredBoxProps = React.PropsWithChildren<{
  $color?: string;
}>;

function ColoredBox(props: ColoredBoxProps) {
  const { children, $color } = props;

  return (
    <div sx={[styles.coloredBox, $color != null && styles.coloredBoxBackgroundColor($color)]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <FlexContainer $align="left">
      <ColoredBox $color="lightblue">Left aligned</ColoredBox>
      <ColoredBox $color="lightgreen">Item</ColoredBox>
    </FlexContainer>
    <FlexContainer $align="right">
      <ColoredBox>Right aligned</ColoredBox>
    </FlexContainer>
    <div sx={[styles.borderBox, styles.borderBoxBorderColor("red")]}>Red border</div>
    <div sx={[styles.shadowBox, styles.shadowBoxBoxShadow("0 2px 4px rgba(0,0,0,0.2)")]}>
      With shadow
    </div>
    <div sx={[styles.blockBox, styles.blockBoxWidth("50%")]}>Half width</div>
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
