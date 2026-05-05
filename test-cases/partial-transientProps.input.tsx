// Partial conversion must preserve generic transient prop types on styled components left behind.
import styled from "styled-components";

const ConvertedPanel = styled.div`
  padding: 12px;
  background: #e0f2fe;
`;

const PreservedList = styled.ul<{ $active?: boolean }>`
  color: ${(props) => (props.$active ? "#111827" : "#6b7280")};
  padding: 8px;

  & li.selected {
    font-weight: 700;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <ConvertedPanel>Converted</ConvertedPanel>
    <PreservedList $active>
      <li className="selected">Preserved transient prop</li>
    </PreservedList>
  </div>
);
