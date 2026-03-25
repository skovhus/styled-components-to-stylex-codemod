import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $shadow } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div sx={styles.box("dark")}>Dark shadow</div>
    <div sx={styles.box("light")}>Light shadow</div>
  </div>
);

const styles = stylex.create({
  box: (boxShadow: "dark" | "light") => ({
    height: 50,
    width: 50,
    padding: 8,
    backgroundColor: "#f0f0f0",
    boxShadow: $shadow[boxShadow],
  }),
});
