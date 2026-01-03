import * as stylex from "@stylexjs/stylex";
import { useRef, useEffect } from "react";

const styles = stylex.create({
  input: {
    padding: "0.5em",
    margin: "0.5em",
    color: "#BF4F74",
    backgroundColor: "papayawhip",
    borderStyle: "none",
    borderRadius: "3px",
    outline: {
      default: null,
      ":focus": "none",
    },
  },
});

export const App = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <input ref={inputRef} placeholder="Focus me on mount!" {...stylex.props(styles.input)} />;
};
