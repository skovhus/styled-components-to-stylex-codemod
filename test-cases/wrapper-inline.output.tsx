import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { ExternalComponent } from "./lib/external-component";

export function App() {
  return (
    <div>
      <ExternalComponent isOpen {...stylex.props(styles.externalComponent)} />
    </div>
  );
}

const styles = stylex.create({
  externalComponent: {
    marginTop: 0,
    marginRight: "-8px",
    marginBottom: 0,
    marginLeft: "-8px",
  },
});
