import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

// Chained pseudo-selectors with :not()
function Input(props: Pick<React.ComponentProps<"input">, "disabled" | "placeholder">) {
  return <input {...props} sx={styles.input} />;
}

// Checkbox with chained pseudos
function Checkbox(props: Pick<React.ComponentProps<"input">, "disabled" | "type">) {
  return <input {...props} sx={styles.checkbox} />;
}

// Border on :not(:last-child) with interpolation — should retain the pseudo condition
function ListItem(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.listItem}>{props.children}</div>;
}

export const App = () => (
  <div>
    <Input placeholder="Focus me..." />
    <Input disabled placeholder="Disabled" />
    <Checkbox type="checkbox" />
    <Checkbox type="checkbox" disabled />
    <ListItem>Item 1</ListItem>
    <ListItem>Item 2</ListItem>
    <ListItem>Item 3 (no border)</ListItem>
  </div>
);

const styles = stylex.create({
  input: {
    paddingBlock: 8,
    paddingInline: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":focus:not(:disabled)": "#bf4f74",
      ":hover:not(:disabled):not(:focus)": "#999",
    },
    borderRadius: 4,
    backgroundColor: {
      default: "white",
      ":disabled": "#f5f5f5",
    },
    outline: {
      default: null,
      ":focus:not(:disabled)": "none",
    },
    cursor: {
      default: null,
      ":disabled": "not-allowed",
    },
  },
  checkbox: {
    width: 20,
    height: 20,
    cursor: "pointer",
    accentColor: {
      default: null,
      ":checked:not(:disabled)": "#bf4f74",
    },
    outline: {
      default: null,
      ":focus:not(:disabled)": "2px solid #4f74bf",
    },
    outlineOffset: {
      default: null,
      ":focus:not(:disabled)": 2,
    },
  },
  listItem: {
    padding: 8,
    borderBottomWidth: {
      default: null,
      ":not(:last-child)": "1px",
    },
    borderBottomStyle: {
      default: null,
      ":not(:last-child)": "solid",
    },
    borderBottomColor: {
      default: null,
      ":not(:last-child)": $colors.bgBorderSolid,
    },
  },
});
