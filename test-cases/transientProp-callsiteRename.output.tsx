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
  className?: string;
  style?: React.CSSProperties;
  sx?: stylex.StyleXStyles;
  asCard?: boolean;
  columnCount?: number;
  floatingOffset?: number;
} & React.ComponentPropsWithRef<typeof PanelBase>;

function ResponsivePanel(props: ResponsivePanelProps) {
  const { className, style, sx, asCard, columnCount, floatingOffset, ...rest } = props;
  return (
    <PanelBase
      {...rest}
      {...mergedSx(
        [
          styles.responsivePanel,
          styles.responsivePanelGridTemplateColumns(`repeat(${columnCount ?? 1}, minmax(0, 1fr))`),
          styles.responsivePanelTop(`${floatingOffset ?? 0}px`),
          asCard && styles.responsivePanelAsCard,
          sx,
        ],
        className,
        style,
      )}
    />
  );
}

function CompactPanel(
  props: Omit<React.ComponentPropsWithRef<typeof ResponsivePanel>, "asCard" | "floatingOffset">,
) {
  const { sx, ...rest } = props;
  return (
    <ResponsivePanel {...rest} asCard={true} floatingOffset={4} sx={[styles.compactPanel, sx]} />
  );
}

const WidgetKit = {
  Panel: ResponsivePanel,
  Legend: {
    Grid: ResponsivePanel,
  },
};

const SelectedPanel = Math.random() > 0.5 ? ResponsivePanel : CompactPanel;

export const App = () => (
  <div style={{ padding: 12 }}>
    <ResponsivePanel asCard columnCount={3} floatingOffset={24} role="region">
      Renamed transient props
    </ResponsivePanel>
    <WidgetKit.Panel asCard columnCount={2}>
      Member transient prop
    </WidgetKit.Panel>
    <WidgetKit.Legend.Grid columnCount={4}>Nested member transient prop</WidgetKit.Legend.Grid>
    <CompactPanel columnCount={1}>Attrs transient defaults</CompactPanel>
    <SelectedPanel asCard floatingOffset={12}>
      Alias transient prop
    </SelectedPanel>
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
  compactPanel: {
    borderRadius: 8,
  },
});
