import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

interface ScrollableProps extends React.ComponentProps<typeof Flex> {
  /** Whether to apply background color - used only for styling */
  $applyBackground?: boolean;
}

export function Scrollable(props: ScrollableProps) {
  const { className, children, style, $applyBackground, ...rest } = props;

  const sx = stylex.props(styles.scrollable, $applyBackground && styles.scrollableApplyBackground);
  return (
    <Flex
      {...rest}
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
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
