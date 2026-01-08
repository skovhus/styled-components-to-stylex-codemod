import * as stylex from "@stylexjs/stylex";
import React from "react";

// Bug 3a: styled("tagName") function call syntax should transform
// the same as styled.tagName - both are valid styled-components syntax.

const styles = stylex.create({
  input: {
    height: "32px",
    padding: "8px",
    backgroundColor: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  button: {
    backgroundColor: "blue",
    color: "white",
  },
});

export function App() {
  return (
    <div>
      <input {...stylex.props(styles.input)} placeholder="Type here" />
      <button {...stylex.props(styles.button)}>Submit</button>
    </div>
  );
}
