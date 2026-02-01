import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & {
  $primary?: boolean;
  hollow?: boolean;
};

function Button(props: ButtonProps) {
  const { children, hollow, $primary } = props;
  return (
    <button
      {...stylex.props(
        styles.button,
        $primary && styles.buttonPrimary,
        hollow && styles.buttonHollow,
        !hollow && $primary && styles.buttonNotHollowPrimary,
        !hollow && !$primary && styles.buttonNotHollowNotPrimary,
      )}
    >
      {children}
    </button>
  );
}

type BadgeProps = Omit<React.ComponentProps<"span">, "className" | "style"> & {
  size?: "small" | "medium" | "large";
};

// Test case: inner ternary tests the same prop as outer
// The inner variants must be guarded by the outer falsy condition
// to prevent the "medium" background from leaking into size === "small"
function Badge(props: BadgeProps) {
  const { children, size } = props;
  return (
    <span
      {...stylex.props(
        styles.badge,
        size === "small" && styles.badgeSizeSmall,
        size !== "small" && size === "large" && styles.badgeSizeNotSmallSizeLarge,
        size !== "small" && size !== "large" && styles.badgeSizeNotSmallSizeNotLarge,
      )}
    >
      {children}
    </span>
  );
}

export const App = () => (
  <div>
    <Button>Normal</Button>
    <Button $primary>Primary</Button>
    <br />
    <Button hollow>Hollow</Button>
    <Button hollow $primary>
      Primary Hollow
    </Button>
    <br />
    <Badge size="small">Small</Badge>
    <Badge size="medium">Medium</Badge>
    <Badge size="large">Large</Badge>
  </div>
);

const styles = stylex.create({
  button: {
    color: "#BF4F74",
    fontSize: "1em",
    margin: "1em",
    paddingBlock: "0.25em",
    paddingInline: "1em",
    borderRadius: "3px",
  },
  buttonPrimary: {
    color: "white",
  },
  buttonHollow: {
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#bf4f74",
  },
  buttonNotHollowPrimary: {
    backgroundColor: "#BF4F74",
  },
  buttonNotHollowNotPrimary: {
    backgroundColor: "white",
  },

  // Test case: inner ternary tests the same prop as outer
  // The inner variants must be guarded by the outer falsy condition
  // to prevent the "medium" background from leaking into size === "small"
  badge: {
    display: "inline-block",
  },
  badgeSizeNotSmallSizeLarge: {
    backgroundColor: "blue",
  },
  badgeSizeNotSmallSizeNotLarge: {
    backgroundColor: "gray",
  },
  badgeSizeSmall: {
    fontSize: "10px",
  },
});
