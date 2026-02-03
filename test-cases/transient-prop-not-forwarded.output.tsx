import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Pattern: styled(Component) with transient prop used only for styling
// The transient prop should NOT be forwarded to the wrapped component
// because the wrapped component doesn't accept it

interface FlexProps {
  column?: boolean;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A Flex component - does NOT accept $applyBackground */
function Flex(props: FlexProps) {
  const { column, gap, className, style, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: column ? "column" : "row",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ScrollableProps extends React.ComponentPropsWithRef<typeof Flex> {
  /** Whether to apply background color - used only for styling */
  $applyBackground?: boolean;
}

/**
 * Scrollable wraps Flex and adds a transient prop for conditional styling.
 * The $applyBackground prop must NOT be passed to Flex since Flex doesn't accept it.
 */
export function Scrollable(props: ScrollableProps) {
  const { className, children, style, $applyBackground, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...mergedSx(
        [styles.scrollable, $applyBackground ? styles.scrollableApplyBackground : undefined],
        className,
        style,
      )}
    >
      {children}
    </Flex>
  );
}

// Usage
export const App = () => (
  <Scrollable $applyBackground column gap={10}>
    <div>Item 1</div>
    <div>Item 2</div>
  </Scrollable>
);

const styles = stylex.create({
  scrollable: {
    overflowY: "auto",
    backgroundColor: "inherit",
  },
  scrollableApplyBackground: {
    backgroundColor: "gray",
  },
});
