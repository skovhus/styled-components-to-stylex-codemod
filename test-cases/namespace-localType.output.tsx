import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export namespace WidgetSet {
  type GridProps = {
    columnCount: number;
    dense?: boolean;
  };

  export function Grid(
    props: GridProps & React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles },
  ) {
    const { className, children, style, sx, dense, columnCount, ...rest } = props;
    return (
      <div {...rest} {...mergedSx([styles.grid(dense, columnCount), sx], className, style)}>
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
  grid: (dense: boolean | undefined, columnCount: number) => ({
    display: "grid",
    gap: 4,
    gridTemplateColumns: dense
      ? `repeat(${columnCount}, 6px 1fr)`
      : `repeat(${columnCount}, 16px 1fr)`,
  }),
});
