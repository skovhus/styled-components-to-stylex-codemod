import styled from "styled-components";
import { truncate } from "./lib/helpers";

// Helper call conditional inside a pseudo selector - should preserve :hover context
const Text = styled.p<{ $truncate?: boolean }>`
  font-size: 14px;
  width: 180px;
  padding: 8px 10px;
  border: 1px solid #cfd8dc;
  background-color: #f8f9fb;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  margin: 0;
  &:hover {
    ${(props) => (props.$truncate ? truncate() : "")}
  }
`;

export const App = () => (
  <div
    style={{
      display: "grid",
      gap: 12,
      padding: 12,
      border: "1px dashed #d1d5db",
      maxWidth: 240,
    }}
  >
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Normal</div>
      <Text>Normal text that will wrap without truncation on hover</Text>
    </div>
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Truncate on hover</div>
      <Text $truncate>Long text that will truncate with ellipsis when you hover over this box</Text>
    </div>
  </div>
);
