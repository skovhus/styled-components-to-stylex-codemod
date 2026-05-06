import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type FadingContentProps = React.PropsWithChildren<{
  isLoading?: boolean;
}>;

function FadingContent(props: FadingContentProps) {
  const { children, isLoading } = props;
  return (
    <div sx={[styles.fadingContent, isLoading && styles.fadingContentLoading]}>{children}</div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div sx={styles.loadingContainer}>Loading</div>
    <FadingContent isLoading>Fading</FadingContent>
  </div>
);

const styles = stylex.create({
  loadingContainer: {
    display: {
      default: "flex",
      "@media print": "block",
    },
    overflow: {
      default: "auto",
      "@media print": "visible",
    },
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
  },
  fadingContent: {
    opacity: {
      default: 1,
      "@media print": 1,
    },
    pointerEvents: {
      default: "auto",
      "@media print": "auto",
    },
    transition: "opacity 0ms 0ms ease-in",
    display: {
      default: "flex",
      "@media print": "block",
    },
    overflow: {
      default: "auto",
      "@media print": "visible",
    },
    height: {
      default: null,
      "@media print": "auto",
    },
    minHeight: {
      default: null,
      "@media print": 0,
    },
  },
  fadingContentLoading: {
    opacity: 0,
    pointerEvents: "none",
    transition: "opacity 100ms 500ms ease-in",
  },
});
