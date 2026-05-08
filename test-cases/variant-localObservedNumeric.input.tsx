// Tests same-file numeric prop observations for identity styles without prepass metadata
import styled from "styled-components";

export const Panel = styled.div<{ height: number }>`
  width: 120px;
  height: ${({ height }) => height};
  padding: 8px;
  background-color: tomato;
  color: white;
`;

export const TransientPanel = styled.div<{ $height: number }>`
  width: 120px;
  height: ${({ $height }) => $height};
  padding: 8px;
  background-color: royalblue;
  color: white;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Panel height={40}>Regular 40</Panel>
    <Panel height={80}>Regular 80</Panel>
    <TransientPanel $height={50}>Transient 50</TransientPanel>
    <TransientPanel $height={90}>Transient 90</TransientPanel>
  </div>
);
