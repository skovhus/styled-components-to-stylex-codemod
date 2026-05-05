// Vendor-prefixed overflow scrolling must map to a valid StyleX property.
import styled from "styled-components";

const ScrollPanel = styled.div`
  -webkit-overflow-scrolling: touch;
  overflow-y: auto;
  max-height: 96px;
  padding: 8px;
  background: #eef2ff;
`;

export const App = () => (
  <ScrollPanel>
    <div>Scrollable panel</div>
    <div>Second row</div>
  </ScrollPanel>
);
