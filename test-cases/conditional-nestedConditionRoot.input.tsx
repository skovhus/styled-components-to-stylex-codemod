// Nested condition root prop with z-index interpolation should preserve all referenced props
import styled from "styled-components";
import type { LayerTransientProps } from "./lib/conditionalNestedConditionRootProps";

const Layer = styled.div<LayerTransientProps>`
  position: relative;
  width: 100px;
  height: 60px;
  background: #ddd;
  color: #222;
  ${(props) => (props.$layer?.isTop ? `z-index: ${props.$zIndex};` : "")}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 8 }}>
    <Layer $layer={{ isTop: true }} $zIndex={3}>
      Top layer
    </Layer>
    <Layer $layer={{ isTop: false }} $zIndex={1}>
      Base layer
    </Layer>
  </div>
);
