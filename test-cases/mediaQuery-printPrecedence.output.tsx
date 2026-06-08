import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type FadingContentProps = React.PropsWithChildren<{
  gutter?: "auto" | "stable";
  isLoading?: boolean;
  overflow?: "auto" | "hidden" | "visible";
}>;

function FadingContent(props: FadingContentProps) {
  const { children, isLoading, gutter, overflow } = props;
  return (
    <div
      sx={[
        styles.fadingContent,
        isLoading && styles.fadingContentLoading,
        gutter != null && gutterVariants[gutter],
        overflow ? styles.fadingContentOverflow(overflow) : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div sx={styles.loadingContainer}>Loading</div>
    <FadingContent gutter="stable" isLoading overflow="hidden">
      Fading
    </FadingContent>
    <FadingContent>Idle</FadingContent>
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
    flexDirection: "column",
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
    transition: "opacity 100ms 500ms ease-in",
    willChange: "opacity",
    backfaceVisibility: "hidden",
    opacity: {
      default: 0,
      "@media print": 1,
    },
    pointerEvents: {
      default: "none",
      "@media print": "auto",
    },
  },
  fadingContentOverflow: (overflow: "auto" | "hidden" | "visible") => ({
    overflow: {
      default: overflow,
      "@media print": "visible",
    },
  }),
});

const gutterVariants = stylex.create({
  auto: {
    scrollbarGutter: "auto",
  },
  stable: {
    scrollbarGutter: "stable",
  },
});
