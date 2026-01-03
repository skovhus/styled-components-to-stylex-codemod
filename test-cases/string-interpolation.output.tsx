import * as stylex from "@stylexjs/stylex";

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
    margin: `${spacing / 2}px 0`,
  },
  conditionalButton: {
    backgroundColor: "#ccc",
    color: "#333",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  themedCard: {
    backgroundColor: theme.colors.primary,
    borderWidth: "1px",
    borderStyle: "solid",
    padding: theme.spacing.md,
    borderRadius: "8px",
    border: `1px solid ${theme.colors.secondary}`,
  },
  dynamicBox: {
    backgroundColor: "(props) => getColor(props.variant)",
    padding: "16px",
    color: "white",
    borderRadius: "4px",
  },
});

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

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Button</button>
    <p {...stylex.props(styles.text)}>Some text</p>
    <button {...stylex.props(styles.conditionalButton)}>Conditional</button>
    <div {...stylex.props(styles.themedCard)}>Themed Card</div>
    <div variant="primary" {...stylex.props(styles.dynamicBox)}>
      Primary
    </div>
    <div variant="secondary" {...stylex.props(styles.dynamicBox)}>
      Secondary
    </div>
  </div>
);
