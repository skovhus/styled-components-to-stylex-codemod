import React from "react";
import * as stylex from "@stylexjs/stylex";

function Container(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.container}>{props.children}</div>;
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
    gap: "12px",
    padding: "8px",
    backgroundColor: "#e8f5e9",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#4caf50",
  },
});
