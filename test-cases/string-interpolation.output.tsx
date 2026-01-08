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
  colors: {
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

type DynamicBoxProps = {
  $variant: string;
};

function DynamicBox(props: DynamicBoxProps) {
  const { $variant, children, className, ...rest } = props;

  const sx = stylex.props(
    styles.dynamicBoxBase,
    $variant === "primary" && styles.dynamicBoxPrimary,
    $variant !== "primary" && styles.dynamicBoxSecondary,
  );
  return (
    <div {...sx} className={[sx.className, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
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
    padding: `${spacing}px`,
    borderRadius: borderRadius,
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
  },
  text: {
    fontSize: `${fontSize}px`,
    lineHeight: lineHeight,
    marginTop: `${spacing / 2}px`,
    marginRight: 0,
    marginBottom: `${spacing / 2}px`,
    marginLeft: 0,
  },
  conditionalButton: {
    backgroundColor: isPrimary ? "#BF4F74" : "#ccc",
    color: isPrimary ? "white" : "#333",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  themedCard: {
    backgroundColor: theme.colors.primary,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: theme.colors.secondary,
    padding: theme.spacing.md,
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
