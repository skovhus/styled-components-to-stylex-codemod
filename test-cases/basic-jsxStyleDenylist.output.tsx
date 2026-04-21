import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function Card(props: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  const { children, style } = props;
  return <div {...mergedSx(styles.card, undefined, style)}>{children}</div>;
}

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

const styles = stylex.create({
  card: {
    padding: 12,
    backgroundColor: "#f0f5ff",
    borderRadius: 6,
  },
});
