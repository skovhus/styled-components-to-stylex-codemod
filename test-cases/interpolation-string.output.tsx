import * as React from "react";

// oxlint-disable no-unused-vars
import * as stylex from "@stylexjs/stylex";

// String interpolation for dynamic values
const dynamicColor = "#BF4F74";
const spacing = 16;
const borderRadius = "4px";

// Template literal with expressions
const fontSize = 14;
const lineHeight = 1.5;

// Conditional string interpolation
const isPrimary = true;

// Array/object property interpolation
const theme = {
  color: {
    primary: "#BF4F74",
    secondary: "#4F74BF",
  },
  spacing: {
    sm: "8px",
    md: "16px",
  },
};

// Function returning string
const getColor = (variant: string) => (variant === "primary" ? "#BF4F74" : "#4F74BF");

type DynamicBoxProps = React.PropsWithChildren<{
  $variant: string;
}>;

function DynamicBox(props: DynamicBoxProps) {
  const { $variant, children } = props;

  const sx = stylex.props(
    styles.dynamicBoxBase,
    $variant === "primary" && styles.dynamicBoxPrimary,
    $variant !== "primary" && styles.dynamicBoxSecondary,
  );

  return <div {...sx}>{children}</div>;
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Button</button>
    <p {...stylex.props(styles.text)}>Some text</p>
    <button {...stylex.props(styles.conditionalButton)}>Conditional</button>
    <div {...stylex.props(styles.themedCard)}>Themed Card</div>
    <DynamicBox $variant="primary">Primary</DynamicBox>
    <DynamicBox $variant="secondary">Secondary</DynamicBox>
  </div>
);

const styles = stylex.create({
  button: {
    backgroundColor: dynamicColor,
    backgroundImage: dynamicColor,
    padding: `${spacing}px`,
    borderRadius: borderRadius,
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
  },
  text: {
    fontSize: `${fontSize}px`,
    lineHeight: lineHeight,
    marginBlock: `${spacing / 2}px`,
    marginInline: 0,
  },
  conditionalButton: {
    backgroundColor: isPrimary ? "#BF4F74" : "#ccc",
    backgroundImage: isPrimary ? "#BF4F74" : "#ccc",
    color: isPrimary ? "white" : "#333",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: "4px",
  },
  themedCard: {
    backgroundColor: `${theme.color.primary}`,
    backgroundImage: `${theme.color.primary}`,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: `${theme.color.secondary}`,
    padding: `${theme.spacing.md}`,
    borderRadius: "8px",
  },
  dynamicBoxBase: {
    padding: "16px",
    color: "white",
    borderRadius: "4px",
  },
  dynamicBoxPrimary: {
    backgroundColor: "#BF4F74",
  },
  dynamicBoxSecondary: {
    backgroundColor: "#4F74BF",
  },
});
