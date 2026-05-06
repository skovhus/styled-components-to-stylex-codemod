import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div sx={styles.loadingContainer}>Loading</div>
    <FadingContent isLoading>Fading</FadingContent>
  </div>
);

type FadingContentProps = {
  children?: React.ReactNode;
  isLoading?: boolean;
};

function FadingContent(props: FadingContentProps) {
  const { children, isLoading } = props;
  return (
    <div
      sx={[
        styles.fadingContent,
        isLoading ? styles.fadingContentIsLoading : undefined,
        isLoading
          ? styles.fadingContentTransition("100ms 500ms")
          : styles.fadingContentTransition("0ms 0ms"),
      ]}
    >
      {children}
    </div>
  );
}

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
  fadingContentIsLoading: {
    opacity: 0,
    pointerEvents: "none",
  },
  fadingContentTransition: (durationAndDelay: string) => ({
    transition: `opacity ${durationAndDelay} ease-in`,
  }),
});
