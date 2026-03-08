import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "style">;

export function TextInput(props: TextInputProps) {
  const { type, readOnly, ...rest } = props;
  const sx = stylex.props(styles.textInput, readOnly && styles.textInputReadonly);
  return <input type={type} readOnly={readOnly} {...rest} {...sx} />;
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <TextInput type="text" placeholder="Editable" />
      <TextInput type="text" readOnly value="Read only field" />
    </div>
  );
}

const styles = stylex.create({
  textInput: {
    paddingBlock: "8px",
    paddingInline: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":focus": "#bf4f74",
    },
    borderRadius: "4px",
    fontSize: "14px",
    backgroundColor: "white",
    outline: {
      default: null,
      ":focus": "none",
    },
  },
  textInputReadonly: {
    backgroundColor: "#f5f5f5",
    borderStyle: "dashed",
    cursor: "default",
  },
});
