import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug 2: When codemod generates wrapper functions, it must include
// proper type annotations for all parameters to avoid implicit 'any'.

interface BoxProps {
  /** Whether the box has a border */
  bordered?: boolean;
  /** Background color override */
  bg?: string;
}

// Component with props that affect styles
export function Box(props: React.PropsWithChildren<BoxProps>) {
  const { children, bordered, bg } = props;

  return (
    <div
      {...stylex.props(
        styles.box,
        !bordered && styles.boxNotBordered,
        bordered ? styles.boxBordered : undefined,
        bg != null && styles.boxBackgroundColor(bg),
      )}
    >
      {children}
    </div>
  );
}

type InputProps = Omit<React.ComponentProps<"input">, "className" | "style">;

// Component with callback that receives event
export function Input(props: InputProps) {
  return <input {...props} {...stylex.props(styles.input)} />;
}

export function Form() {
  return (
    <Box bordered bg="lightgray">
      <Input onChange={(e) => console.log(e.target.value)} />
    </Box>
  );
}

export function App() {
  return <Form />;
}

const styles = stylex.create({
  box: {
    padding: "16px",
    backgroundColor: "white",
  },
  boxNotBordered: {
    borderStyle: "none",
  },
  boxBordered: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
  boxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),

  input: {
    padding: "8px",
    outline: {
      default: null,
      ":focus": "2px solid blue",
    },
  },
});
