import styled from "styled-components";

type Props = { enabled?: boolean };

const StatusBadge = styled.div<Props>`
  background-color: ${({ enabled, theme }) => (enabled ? theme.color.greenBase : theme.color.labelMuted)};
  color: white;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <StatusBadge enabled>On</StatusBadge>
    <StatusBadge enabled={false}>Off</StatusBadge>
    <StatusBadge>Default</StatusBadge>
  </div>
);
