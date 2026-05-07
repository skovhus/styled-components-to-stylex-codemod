// Transient props used for styles must be renamed consistently at wrapper callsites.
import * as React from "react";
import styled from "styled-components";

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

const ResponsivePanel = styled(PanelBase)<{
  $asCard?: boolean;
  $columnCount?: number;
  $floatingOffset?: number;
}>`
  display: grid;
  grid-template-columns: repeat(${(props) => props.$columnCount ?? 1}, minmax(0, 1fr));
  top: ${(props) => props.$floatingOffset ?? 0}px;
  padding: ${(props) => (props.$asCard ? "16px" : "8px")};
  background-color: #eef2ff;
`;

const CompactPanel = styled(ResponsivePanel).attrs({
  $asCard: true,
  $floatingOffset: 4,
})`
  border-radius: 8px;
`;

const WidgetKit = {
  Panel: ResponsivePanel,
  Legend: {
    Grid: ResponsivePanel,
  },
};

const SelectedPanel = Math.random() > 0.5 ? ResponsivePanel : CompactPanel;

export const App = () => (
  <div style={{ padding: 12 }}>
    <ResponsivePanel $asCard $columnCount={3} $floatingOffset={24} role="region">
      Renamed transient props
    </ResponsivePanel>
    <WidgetKit.Panel $asCard $columnCount={2}>
      Member transient prop
    </WidgetKit.Panel>
    <WidgetKit.Legend.Grid $columnCount={4}>Nested member transient prop</WidgetKit.Legend.Grid>
    <CompactPanel $columnCount={1}>Attrs transient defaults</CompactPanel>
    <SelectedPanel $asCard $floatingOffset={12}>
      Alias transient prop
    </SelectedPanel>
  </div>
);
