// Raw CSS variable expressions used as normal property values must not be emitted inside stylex.create.
import styled from "styled-components";

const ColumnTrack = styled.div`
  display: grid;
  grid-template-columns: var(--column-width);
  min-width: var(--column-min-width, min-content, 0);
  width: min(var(--column-width), var(--column-max-width));
  gap: 8px;
  background-color: #f1f5f9;
`;

export const App = () => (
  <div style={{ padding: 12 }}>
    <ColumnTrack>Variable columns</ColumnTrack>
  </div>
);
