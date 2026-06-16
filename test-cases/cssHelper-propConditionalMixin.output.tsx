import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TileProps = React.PropsWithChildren<{
  big?: boolean;
}>;

function Tile(props: TileProps) {
  const { children, big } = props;
  return <div sx={[styles.tile, big && styles.tileBig]}>{children}</div>;
}

type PanelProps = React.PropsWithChildren<{
  big?: boolean;
}>;

// Second consumer of the same helper: the conditional is inlined independently per consumer.
function Panel(props: PanelProps) {
  const { children, big } = props;
  return <div sx={[styles.panel, big && styles.panelBig]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <Tile big>Big tile (100px)</Tile>
    <Tile>Small tile (50px)</Tile>
    <Panel big>Big panel</Panel>
    <Panel>Small panel</Panel>
  </div>
);

const styles = stylex.create({
  tile: {
    width: 50,
    backgroundColor: "lightsteelblue",
    padding: 8,
  },
  tileBig: {
    width: 100,
  },
  panel: {
    width: 50,
    backgroundColor: "peachpuff",
    height: 40,
  },
  panelBig: {
    width: 100,
  },
});
