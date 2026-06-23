// Intrinsic styled component style props: static styles promote, dynamic caller styles stay inline
import styled from "styled-components";

const TICK_OFFSET = 4;
const HEADER_PADDING_RIGHT = 24;
const ARCHIVED_BG = "#eef2ff";

const Tick = styled.div`
  margin: 3px;
  background-color: coral;
`;

const Label = styled.span`
  font-weight: bold;
  color: navy;
`;

const DrillHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid #ccc;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Tick style={{ left: 6 + TICK_OFFSET }}>Tick</Tick>
    <Label className="custom-label">Label</Label>
    <DrillHeader style={{ paddingRight: HEADER_PADDING_RIGHT }}>Dynamic padding</DrillHeader>
    <DrillHeader style={{ paddingRight: HEADER_PADDING_RIGHT, backgroundColor: ARCHIVED_BG }}>
      Dynamic padding and background
    </DrillHeader>
  </div>
);
