import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ColumnContainerProps = Omit<React.ComponentProps<"div">, "className"> & {
  $noGrowOrShrink?: boolean;
  $basis?: number;
};

/**
 * Arrow function returns a template literal with nested conditionals.
 * The codemod should preserve this via a stylex function.
 */
export function ColumnContainer(props: ColumnContainerProps) {
  const { children, style, $noGrowOrShrink, $basis, ...rest } = props;
  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.columnContainer,
          $noGrowOrShrink && styles.columnContainerNoGrowOrShrink,
          styles.columnContainerFlexShrink({
            $noGrowOrShrink,
            $basis,
          }),
        ],
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <ColumnContainer
    $noGrowOrShrink
    $basis={1}
    style={{
      display: "flex",
      gap: 8,
      width: 260,
      border: "1px solid #ccc",
      padding: 8,
      background: "#f8f8f8",
    }}
  >
    <div style={{ width: 40, height: 24, background: "#BF4F74" }} />
    <div style={{ width: 120, height: 24, background: "#4F74BF" }} />
    <div style={{ width: 80, height: 24, background: "#74BF4F" }} />
  </ColumnContainer>
);

const styles = stylex.create({
  /**
   * Arrow function returns a template literal with nested conditionals.
   * The codemod should preserve this via a stylex function.
   */
  columnContainer: {
    flexGrow: 1,
  },
  columnContainerNoGrowOrShrink: {
    flexGrow: 0,
  },
  columnContainerFlexShrink: (props) => ({
    flexShrink: `var(--flex-shrink, ${props.$noGrowOrShrink ? 0 : props.$basis ? 1 : 2})`,
  }),
});
