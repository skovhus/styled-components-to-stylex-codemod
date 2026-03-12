import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import type { LayerTransientProps } from "./lib/conditionalNestedConditionRootProps";

type LayerProps = React.PropsWithChildren<LayerTransientProps>;

function Layer(props: LayerProps) {
  const { children, $zIndex, $layer } = props;

  return (
    <div sx={[styles.layer, $layer.isTop ? styles.layerZIndex($zIndex) : undefined]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 8 }}>
    <Layer $layer={{ isTop: true }} $zIndex="3">
      Top layer
    </Layer>
    <Layer $layer={{ isTop: false }} $zIndex="1">
      Base layer
    </Layer>
  </div>
);

const styles = stylex.create({
  layer: {
    position: "relative",
    width: 100,
    height: 60,
    backgroundColor: "#ddd",
    color: "#222",
  },
  layerZIndex: (zIndex: string) => ({
    zIndex,
  }),
});
