// Dynamic style key always concatenates full suffix to avoid collisions
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ padding: "16px" }}>
      <div
        sx={styles.myBorder({
          borderWidth: 2,
        })}
      >
        Bordered box
      </div>
    </div>
  );
}

const styles = stylex.create({
  myBorder: (props: { borderWidth: number }) => ({
    borderStyle: "solid",
    borderColor: "black",
    borderWidth: `${props.borderWidth}px`,
  }),
});
