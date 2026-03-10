// Exported styled component should include ref in its type and forward it.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function StyledInput(props: Omit<React.ComponentProps<"input">, "className" | "style">) {
  const { ref, ...rest } = props;

  return <input ref={ref} {...rest} sx={styles.input} />;
}

export function StyledDiv(props: Omit<React.ComponentProps<"div">, "className" | "style">) {
  const { children, ref, ...rest } = props;

  return (
    <div ref={ref} {...rest} sx={styles.div}>
      {children}
    </div>
  );
}

export const App = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const divRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <StyledInput ref={inputRef} placeholder="Focused on mount" />
      <StyledDiv ref={divRef}>Div with ref</StyledDiv>
    </div>
  );
};

const styles = stylex.create({
  input: {
    padding: "0.5em",
    margin: "0.5em",
    color: "#bf4f74",
    backgroundColor: "papayawhip",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: "3px",
  },
  div: {
    padding: "16px",
    backgroundColor: "#f0f0f0",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
  },
});
