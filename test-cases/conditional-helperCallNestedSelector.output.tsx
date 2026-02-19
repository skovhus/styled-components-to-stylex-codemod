import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TextProps = React.PropsWithChildren<{
  $truncate?: boolean;
}>;

// Helper call conditional inside a pseudo selector.
// The adapter provides cssText so the codemod can expand individual CSS properties
// and wrap them in the pseudo selector context.
function Text(props: TextProps) {
  const { children, $truncate } = props;

  return (
    <p {...stylex.props(styles.text, $truncate ? styles.textTruncate : undefined)}>{children}</p>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 180, padding: 16 }}>
    <Text>Normal text (no truncation)</Text>
    <Text $truncate>Truncated text on hover - this long text overflows when you hover over it</Text>
  </div>
);

const styles = stylex.create({
  // Helper call conditional inside a pseudo selector.
  // The adapter provides cssText so the codemod can expand individual CSS properties
  // and wrap them in the pseudo selector context.
  text: {
    fontSize: "14px",
    color: "#333",
    padding: "8px",
    backgroundColor: "#f5f5f5",
  },
  textTruncate: {
    whiteSpace: {
      default: null,
      ":hover": "nowrap",
    },
    overflow: {
      default: null,
      ":hover": "hidden",
    },
    textOverflow: {
      default: null,
      ":hover": "ellipsis",
    },
  },
});
