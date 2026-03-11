// Data attributes used as boolean JSX props must accept boolean in the generated type
import * as React from "react";
import styled from "styled-components";

const ListRow = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
`;

const Overlay = styled.div<{ "data-collapsed-overlay"?: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.05);
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8, position: "relative" }}>
      <ListRow data-list-row>
        <span>Row with boolean data attr</span>
      </ListRow>
      <ListRow data-list-row data-selected>
        <span>Row with multiple boolean data attrs</span>
      </ListRow>
      <Overlay data-collapsed-overlay data-collapsed-id="abc">
        <span>Overlay</span>
      </Overlay>
    </div>
  );
}
