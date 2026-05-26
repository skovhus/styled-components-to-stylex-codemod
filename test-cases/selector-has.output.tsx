import React from "react";
import * as stylex from "@stylexjs/stylex";
import { IconMarker } from "./selector-has.input.stylex";

function Button({ children }: { children?: React.ReactNode }) {
  return <button sx={styles.button}>{children}</button>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Button>No icon</Button>
    <Button>
      With icon <span sx={[styles.icon, IconMarker]}>★</span>
    </Button>
  </div>
);

const styles = stylex.create({
  icon: {
    color: "blue",
    fontSize: 20,
  },
  button: {
    paddingBlock: 8,
    paddingLeft: 16,
    paddingRight: {
      default: 16,
      [stylex.when.descendant(":is(*)", IconMarker)]: 32,
    },
    backgroundColor: {
      default: "lightgray",
      [stylex.when.descendant(":is(*)", IconMarker)]: "lightyellow",
    },
  },
});
