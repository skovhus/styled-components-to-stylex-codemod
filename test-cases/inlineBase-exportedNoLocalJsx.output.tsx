import React from "react";
import * as stylex from "@stylexjs/stylex";

export function Container(props: Pick<React.ComponentProps<"div">, "ref" | "children">) {
  return <div {...props} sx={styles.container} />;
}

export function App() {
  return <div>Exported only</div>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 4,
    backgroundColor: "#f4f4ff",
  },
});
