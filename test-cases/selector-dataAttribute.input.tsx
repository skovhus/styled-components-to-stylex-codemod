import styled from "styled-components";

const Box = styled.div`
  opacity: 0;
  transition: opacity 0.2s;
  &[data-visible="true"] {
    opacity: 1;
  }
`;

// Comma-separated ancestor attribute selectors
const MenuItem = styled.div`
  opacity: 0.5;
  padding: 8px 12px;

  [aria-checked="true"] &,
  [data-focused="true"] &,
  [aria-selected="true"] &,
  [aria-checked="mixed"] & {
    opacity: 1;
  }
`;

// Single ancestor attribute selector (no comma)
const Indicator = styled.div`
  opacity: 0;

  [data-active="true"] & {
    opacity: 1;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Box data-visible="true" style={{ backgroundColor: "lightblue", padding: 20 }}>
        Visible
      </Box>
      <Box style={{ backgroundColor: "lightcoral", padding: 20 }}>Hidden</Box>
      <div aria-checked="true">
        <MenuItem style={{ backgroundColor: "lightgreen" }}>Checked</MenuItem>
      </div>
      <div>
        <MenuItem style={{ backgroundColor: "lightyellow" }}>Default</MenuItem>
      </div>
      <div data-active="true">
        <Indicator style={{ backgroundColor: "lightcyan", padding: 10 }}>Active</Indicator>
      </div>
    </div>
  );
}
