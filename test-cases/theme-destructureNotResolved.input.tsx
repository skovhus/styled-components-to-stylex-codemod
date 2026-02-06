import styled from "styled-components";

// Bug: The destructured `theme` from `${({ enabled, theme }) => ...}` is converted to
// `props.theme.color.greenBase` but `theme` doesn't exist on the component's props type.
// The theme reference should be resolved via the adapter. Causes TS2339.

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
