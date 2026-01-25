import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $config } from "./tokens.stylex";

export function App() {
  return <div {...stylex.props(styles.card)} />;
}

const styles = stylex.create({
  card: {
    padding: $config["ui.spacing.medium"],
    margin: $config["ui.spacing.small"],
    backgroundColor: "white",
    borderRadius: "8px",
  },
});
