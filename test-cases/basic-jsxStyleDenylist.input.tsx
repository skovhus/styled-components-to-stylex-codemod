// Denylisted multi-component shorthands (font, animation, transition, grid, …)
// can't be safely promoted regardless of whether the styled component is local
// or resolved from an imported base. All call sites for the affected component
// fall back to inline-style merging via mergedSx.
import styled from "styled-components";

const Card = styled.div`
  padding: 12px;
  background-color: #f0f5ff;
  border-radius: 6px;
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Card style={{ color: "white", backgroundColor: "#4f74bf" }}>
        Sibling site is also held back by the denylisted entry below
      </Card>
      <Card style={{ font: "12px/1.4 system-ui", color: "black" }}>
        font shorthand is denylisted
      </Card>
    </div>
  );
}
