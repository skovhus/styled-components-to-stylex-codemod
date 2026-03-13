import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  align?: "left" | "center" | "right";
  selectable?: boolean;
}

// This chain is silently not recognized: styled("span").withConfig(...).attrs(fn)
// The codemod produces no output and no warning.
export function Text(props: TextProps & Omit<React.ComponentProps<"span">, "className" | "style">) {
  const { children, align, selectable, ...rest } = props;

  return (
    <span
      {...rest}
      sx={[
        styles.text,
        align
          ? styles.textTextAlign({
              textAlign: align,
            })
          : undefined,
        selectable ? styles.textSelectable : undefined,
      ]}
    >
      {children}
    </span>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <Text>Default left, not selectable</Text>
      <Text align="center">Centered</Text>
      <Text selectable>Selectable</Text>
    </div>
  );
}

const styles = stylex.create({
  text: {
    fontStyle: "normal",
  },
  textSelectable: {
    userSelect: "text",
  },
  textTextAlign: (props: { textAlign: "left" | "center" | "right" }) => ({
    textAlign: props.textAlign,
  }),
});
