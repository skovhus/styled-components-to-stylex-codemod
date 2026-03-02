import React from "react";
import * as stylex from "@stylexjs/stylex";

function Button(
  props: { children?: React.ReactNode } & Pick<React.ComponentProps<"button">, "disabled">,
) {
  const { children, ...rest } = props;

  return (
    <button {...rest} {...stylex.props(styles.button)}>
      {children}
    </button>
  );
}

function Select(
  props: { children?: React.ReactNode } & Pick<React.ComponentProps<"select">, "disabled">,
) {
  const { children, ...rest } = props;

  return (
    <select {...rest} {...stylex.props(styles.select)}>
      {children}
    </select>
  );
}

function Textarea(
  props: { children?: React.ReactNode } & Pick<
    React.ComponentProps<"textarea">,
    "defaultValue" | "disabled"
  >,
) {
  const { children, ...rest } = props;

  return (
    <textarea {...rest} {...stylex.props(styles.textarea)}>
      {children}
    </textarea>
  );
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
    paddingBlock: "8px",
    paddingInline: "16px",
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
    borderRadius: "4px",
    cursor: {
      default: "pointer",
      ":is([disabled])": "not-allowed",
    },
  },
  select: {
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: "4px",
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
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: "4px",
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
