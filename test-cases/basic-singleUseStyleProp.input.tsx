// Single-use intrinsic styled component with style prop should inline with mergedSx
import styled from "styled-components";

const TICK_OFFSET = 4;

const Tick = styled.div`
  margin: 3px;
  background-color: coral;
`;

const Label = styled.span`
  font-weight: bold;
  color: navy;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Tick style={{ left: 6 + TICK_OFFSET }}>Tick</Tick>
    <Label className="custom-label">Label</Label>
  </div>
);
