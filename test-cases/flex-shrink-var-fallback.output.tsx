import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ColumnContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $noGrowOrShrink?: boolean;
  $basis?: number;
};

/**
 * Arrow function returns a template literal with nested conditionals.
 * The codemod should preserve this via a stylex function.
 */
export function ColumnContainer(props: ColumnContainerProps) {
  const { children, $noGrowOrShrink, $basis } = props;
  return (
    <div
      {...stylex.props(
        styles.columnContainer,
        $noGrowOrShrink && styles.columnContainerNoGrowOrShrink,
        styles.columnContainerFlexShrink({
          $noGrowOrShrink,
          $basis,
        }),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <ColumnContainer $noGrowOrShrink $basis={1}>
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
