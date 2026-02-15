import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

function Box(props: Omit<React.ComponentProps<"div">, "className">) {
  const { children, style, ...rest } = props;

  return (
    <div {...rest} {...mergedSx(styles.box, undefined, style)}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Box data-visible="true" style={{ backgroundColor: "lightblue", padding: 20 }}>
        Visible
      </Box>
      <Box style={{ backgroundColor: "lightcoral", padding: 20 }}>Hidden</Box>
    </div>
  );
}

const styles = stylex.create({
  box: {
    opacity: {
      default: 0,
      ':is([data-visible="true"])': 1,
    },
    transition: "opacity 0.2s",
  },
});
