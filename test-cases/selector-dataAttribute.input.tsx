import styled from "styled-components";

const Box = styled.div`
  opacity: 0;
  transition: opacity 0.2s;
  &[data-visible="true"] {
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
    </div>
  );
}
