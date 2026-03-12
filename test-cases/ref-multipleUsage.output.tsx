// Ref usage across multiple callsites should not force wrapper emission.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function App() {
  const firstRef = React.useRef<HTMLDivElement>(null);
  const secondRef = React.useRef<HTMLDivElement>(null);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div ref={firstRef} sx={styles.card}>
        First card
      </div>
      <div ref={secondRef} sx={styles.card}>
        Second card
      </div>
    </div>
  );
}

const styles = stylex.create({
  card: {
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    backgroundColor: "#f8f8f8",
  },
});
