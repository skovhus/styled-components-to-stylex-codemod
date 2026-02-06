import styled from "styled-components";

type Props = { enabled?: boolean };

const StatusIcon = styled.div<Props>`
  fill: ${({ enabled, theme }) => (enabled ? theme.color.greenBase : theme.color.labelMuted)};
  width: 6px;
  height: 6px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <StatusIcon enabled />
    <StatusIcon enabled={false} />
    <StatusIcon />
  </div>
);
