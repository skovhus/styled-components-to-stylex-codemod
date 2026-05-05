import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type PanelBaseProps = React.PropsWithChildren<{
  className?: string;
  role?: string;
  style?: React.CSSProperties;
}>;

function PanelBase(props: PanelBaseProps) {
  const { children, className, style, ...rest } = props;
  return (
    <section {...rest} className={className} style={style}>
      {children}
    </section>
  );
}

type ResponsivePanelProps = {
  asCard?: boolean;
  columnCount?: number;
  floatingOffset?: number;
} & PanelBaseProps;

function ResponsivePanel(props: ResponsivePanelProps) {
  const { asCard, children, className, columnCount, floatingOffset, style, ...rest } = props;
  return (
    <PanelBase
      {...rest}
      {...mergedSx(
        [
          styles.responsivePanel,
          styles.responsivePanelGridTemplateColumns(columnCount ?? 1),
          styles.responsivePanelTop(floatingOffset ?? 0),
          asCard ? styles.responsivePanelAsCard : styles.responsivePanelNotAsCard,
        ],
        className,
        style,
      )}
    >
      {children}
    </PanelBase>
  );
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <ResponsivePanel asCard columnCount={3} floatingOffset={24} role="region">
      Renamed transient props
    </ResponsivePanel>
  </div>
);

const styles = stylex.create({
  responsivePanel: {
    display: "grid",
    backgroundColor: "#eef2ff",
  },
  responsivePanelGridTemplateColumns: (columnCount: number) => ({
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
  }),
  responsivePanelTop: (floatingOffset: number) => ({
    top: `${floatingOffset}px`,
  }),
  responsivePanelAsCard: {
    padding: 16,
  },
  responsivePanelNotAsCard: {
    padding: 8,
  },
});
