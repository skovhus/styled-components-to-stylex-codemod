import styled from "styled-components";

// Template literal with non-transient props should emit StyleX style functions.
// These are props without the $ prefix that are used in template literal interpolations.

const Box = styled.div<{ size?: number }>`
  padding: 8px;
  width: ${(props) => `${props.size ?? 100}px`};
  height: ${(props) => `${props.size ?? 100}px`};
  background-color: paleturquoise;
  border: 2px solid teal;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Box size={150}>150x150</Box>
    <Box size={100}>100x100</Box>
    <Box>Default (100x100)</Box>
  </div>
);
