import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export namespace WidgetSet {
  type GridProps = {
    columnCount: number;
    dense?: boolean;
  };

  export function Grid(
    props: GridProps & Omit<React.ComponentProps<"div">, "className" | "style">,
  ) {
    const { children, columnCount, dense, ...rest } = props;
    return (
      <div {...rest} sx={styles.grid({ columnCount, dense })}>
        {children}
      </div>
    );
  }
}

export const App = () => (
  <WidgetSet.Grid columnCount={2}>
    <span>Alpha</span>
    <span>Beta</span>
  </WidgetSet.Grid>
);

const styles = stylex.create({
  grid: (props: { columnCount: number; dense?: boolean }) => ({
    display: "grid",
    gridTemplateColumns: props.dense
      ? `repeat(${props.columnCount}, 6px 1fr)`
      : `repeat(${props.columnCount}, 16px 1fr)`,
    gap: 4,
  }),
});
