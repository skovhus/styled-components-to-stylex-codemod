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

export const Fader = styled.div<{ opacity: number }>`
  width: 120px;
  padding: 8px;
  opacity: ${({ opacity }) => opacity};
  background-color: seagreen;
  color: white;
`;

export const TransientFader = styled.div<{ $opacity: number }>`
  width: 120px;
  padding: 8px;
  opacity: ${({ $opacity }) => $opacity};
  background-color: rebeccapurple;
  color: white;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Panel height={40}>Regular 40</Panel>
    <Panel height={80}>Regular 80</Panel>
    <TransientPanel $height={50}>Transient 50</TransientPanel>
    <TransientPanel $height={90}>Transient 90</TransientPanel>
    <Fader opacity={0.4}>Opacity 0.4</Fader>
    <Fader opacity={0.8}>Opacity 0.8</Fader>
    <TransientFader $opacity={0.5}>Transient 0.5</TransientFader>
    <TransientFader $opacity={0.9}>Transient 0.9</TransientFader>
  </div>
);
