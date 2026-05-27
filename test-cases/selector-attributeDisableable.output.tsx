import React from "react";
import * as stylex from "@stylexjs/stylex";

function Button(props: Omit<React.ComponentProps<"button">, "className" | "style" | "sx">) {
  return <button {...props} sx={styles.button} />;
}

function Select(props: Omit<React.ComponentProps<"select">, "className" | "style" | "sx">) {
  return <select {...props} sx={styles.select} />;
}

function Textarea(props: Omit<React.ComponentProps<"textarea">, "className" | "style" | "sx">) {
  return <textarea {...props} sx={styles.textarea} />;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <Button>Enabled</Button>
    <Button disabled>Disabled</Button>
    <Select>
      <option>Enabled</option>
    </Select>
    <Select disabled>
      <option>Disabled</option>
    </Select>
    <Textarea defaultValue="Enabled" />
    <Textarea disabled defaultValue="Disabled" />
  </div>
);

const styles = stylex.create({
  button: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: {
      default: "#bf4f74",
      ":is([disabled])": "#ccc",
    },
    color: {
      default: "white",
      ":is([disabled])": "#666",
    },
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
    cursor: {
      default: "pointer",
      ":is([disabled])": "not-allowed",
    },
  },
  select: {
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: 4,
    backgroundColor: {
      default: null,
      ":is([disabled])": "#f5f5f5",
    },
    color: {
      default: null,
      ":is([disabled])": "#999",
    },
  },
  textarea: {
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: 4,
    backgroundColor: {
      default: null,
      ":is([disabled])": "#f5f5f5",
    },
    color: {
      default: null,
      ":is([disabled])": "#999",
    },
  },
});
