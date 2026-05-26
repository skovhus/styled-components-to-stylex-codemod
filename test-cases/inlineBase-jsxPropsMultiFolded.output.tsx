import React from "react";
import * as stylex from "@stylexjs/stylex";

function Container({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.container}>{children}</div>;
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Folded A</Container>
      <Container>Folded B</Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 8,
    backgroundColor: "#e8f5e9",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#4caf50",
  },
});
