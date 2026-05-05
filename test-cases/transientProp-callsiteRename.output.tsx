// Transient props used for styles must be renamed consistently at wrapper callsites.
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
} & React.ComponentPropsWithRef<typeof PanelBase>;

function ResponsivePanel(props: ResponsivePanelProps) {
  const { className, children, style, asCard, columnCount, floatingOffset, ...rest } = props;
  return (
    <PanelBase
      {...rest}
      {...mergedSx(
        [
          styles.responsivePanel,
          styles.responsivePanelGridTemplateColumns(`repeat(${columnCount ?? 1}, minmax(0, 1fr))`),
          styles.responsivePanelTop(`${floatingOffset ?? 0}px`),
          asCard && styles.responsivePanelAsCard,
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
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    top: "0px",
    padding: "8px",
    backgroundColor: "#eef2ff",
  },
  responsivePanelAsCard: {
    padding: "16px",
  },
  responsivePanelGridTemplateColumns: (gridTemplateColumns: string) => ({
    gridTemplateColumns,
  }),
  responsivePanelTop: (top: string) => ({
    top,
  }),
});
