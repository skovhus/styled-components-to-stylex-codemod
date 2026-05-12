import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export namespace WidgetSet {
  type GridProps = {
    columnCount: number;
    dense?: boolean;
  };

  export function Grid(props: GridProps & React.ComponentProps<"div">) {
    const { className, children, style, dense, columnCount, ...rest } = props;
    return (
      <div
        {...rest}
        {...mergedSx([styles.grid, styles.gridGridTemplateColumns(props)], className, style)}
      >
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
  grid: {
    display: "grid",
    gap: 4,
  },
  gridGridTemplateColumns: (props) => ({
    gridTemplateColumns: props.dense
      ? `repeat(${props.columnCount}, 6px 1fr)`
      : `repeat(${props.columnCount}, 16px 1fr)`,
  }),
});
