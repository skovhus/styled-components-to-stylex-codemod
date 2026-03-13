// Dynamic grid-row inline style promoted to StyleX should use string type
import * as React from "react";
import styled from "styled-components";

const Cell = styled.div`
  padding: 8px;
  background-color: #e3f2fd;
  border: 1px solid #90caf9;
`;

export const App = ({ row }: { row: string }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 16 }}>
    <Cell style={{ gridRow: row }}>Dynamic Row</Cell>
    <Cell style={{ gridRow: 1 }}>Static Row 1</Cell>
    <Cell>No Grid Row</Cell>
  </div>
);
