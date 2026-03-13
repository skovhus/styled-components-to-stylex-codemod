import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type ScrollableProps = {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  applyBackground?: boolean;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

/**
 * Exported styled(ImportedComponent) with non-$-prefixed prop used only for CSS.
 * The gutter prop is only used in the CSS template and should NOT be forwarded to Flex.
 */
export function Scrollable(props: ScrollableProps) {
  const { children, applyBackground, ...rest } = props;

  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.scrollable,
        applyBackground ? styles.scrollableApplyBackground : undefined,
        props.gutter != null &&
          styles.scrollableScrollbarGutter({
            scrollbarGutter: props.gutter,
          }),
      )}
    >
      {children}
    </Flex>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Scrollable gutter="stable" applyBackground gap={8}>
      <div>Stable gutter with background</div>
    </Scrollable>
    <Scrollable gutter="auto" gap={4}>
      <div>Auto gutter, no background</div>
    </Scrollable>
    <Scrollable gap={12}>
      <div>Default (no gutter, no background)</div>
    </Scrollable>
  </div>
);

const styles = stylex.create({
  scrollable: {
    overflowY: "auto",
    position: "relative",
    flexGrow: 1,
    backgroundColor: "inherit",
    scrollbarGutter: "auto",
  },
  scrollableApplyBackground: {
    backgroundColor: "gray",
  },
  scrollableScrollbarGutter: (props: { scrollbarGutter: "auto" | "stable" | string }) => ({
    scrollbarGutter: props.scrollbarGutter,
  }),
});
