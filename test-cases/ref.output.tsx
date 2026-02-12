import * as stylex from "@stylexjs/stylex";
import { useRef, useEffect } from "react";

export const App = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return <input ref={inputRef} placeholder="Focus me on mount!" {...stylex.props(styles.input)} />;
};

const styles = stylex.create({
  input: {
    padding: "0.5em",
    margin: "0.5em",
    color: "#bf4f74",
    backgroundColor: "papayawhip",
    backgroundImage: "none",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: "3px",
  },
});
