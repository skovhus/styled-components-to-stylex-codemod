import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type PanelProps = React.PropsWithChildren<{
  wide?: boolean;
}>;

export function Panel(props: PanelProps) {
  const { wide, ...rest } = props;
  return <div {...rest} sx={[styles.panel, wide && styles.panelWide]} />;
}

export const App = () => (
  <div style={{ containerType: "inline-size", display: "flex", gap: "8px" }}>
    <Panel>Default</Panel>
    <Panel wide>Wide</Panel>
  </div>
);

const styles = stylex.create({
  panel: {
    width: {
      default: "calc(100% - 120px)",
      "@media print": "auto",
      ["@container panel (max-width: 640px)"]: "calc(100% - 40px)",
    },
    backgroundColor: "#e0f2fe",
    padding: 16,
  },
  panelWide: {
    width: {
      default: "100%",
      "@media print": "auto",
      ["@container panel (max-width: 640px)"]: "100%",
    },
  },
});
