import React from "react";
import * as stylex from "@stylexjs/stylex";

// Mock helper functions that would come from project mixins
// These are the callees that need adapter resolution:
// - fontWeight (from styles/mixins)
// - fontSize (from styles/mixins)
// - transitionSpeed (from styles/styled)
// - textSize (from components/Text)
// - thinBorderThemed (from styles/mixins)

const fontWeight = (weight: "normal" | "medium" | "bold") => {
  const weights = { normal: 400, medium: 500, bold: 600 };
  return weights[weight];
};

const fontSize = (size: "small" | "medium" | "large") => {
  const sizes = { small: "12px", medium: "14px", large: "16px" };
  return sizes[size];
};

const transitionSpeed = (type: "fast" | "normal" | "slow") => {
  const speeds = { fast: "100ms", normal: "200ms", slow: "300ms" };
  return speeds[type];
};

/**
 * Test case for adapter callee resolution.
 * The adapter should resolve these helper function calls.
 */
function StyledText({ children }: { children: React.ReactNode }) {
  return <span {...stylex.props(styles.styledText)}>{children}</span>;
}

function StyledButton({ children }: { children: React.ReactNode }) {
  return <button {...stylex.props(styles.styledButton)}>{children}</button>;
}

export function Text({ children }: { children: React.ReactNode }) {
  return <StyledText>{children}</StyledText>;
}

export function Button({ children }: { children: React.ReactNode }) {
  return <StyledButton>{children}</StyledButton>;
}

export const App = () => (
  <div>
    <Text>Hello World</Text>
    <Button>Click Me</Button>
  </div>
);

const styles = stylex.create({
  styledText: {
    fontWeight: 500,
    fontSize: "14px",
    transition: "color 100ms",
  },
  styledButton: {
    fontWeight: 600,
    fontSize: "12px",
    transition: "background 200ms",
    padding: "8px 16px",
  },
});
