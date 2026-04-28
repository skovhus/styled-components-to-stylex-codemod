// Exported sx-aware wrapper with app-like verbose className/style merging.
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";

export const FloatingButton = styled(SxAwareButton)<{ $primary?: boolean }>`
  background: white;
  border-radius: 4px;
  padding: 8px 12px;
  ${(p) => p.$primary && "background: blue; color: white;"}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <FloatingButton>secondary</FloatingButton>
    <FloatingButton $primary>primary</FloatingButton>
    <FloatingButton sx={{}}>with-sx</FloatingButton>
  </div>
);
