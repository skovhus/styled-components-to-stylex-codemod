import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// Bug 2: When codemod generates wrapper functions, it must include
// proper type annotations for all parameters to avoid implicit 'any'.

interface BoxProps extends React.ComponentProps<"div"> {
  /** Whether the box has a border */
  bordered?: boolean;
  /** Background color override */
  bg?: string;
}

// Component with props that affect styles
export function Box(props: BoxProps) {
  const { children, style, bordered, bg, ...rest } = props;
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.box,
        !bordered && styles.boxNotBordered,
        bordered && styles.boxBordered,
        bg != null && styles.boxBackgroundColor(bg),
      )}
      style={style}
    >
      {children}
    </div>
  );
}

type InputProps = React.ComponentProps<"input">;

// Component with callback that receives event
export function Input(props: InputProps) {
  const { style, ...rest } = props;
  return <input {...rest} {...stylex.props(styles.input)} style={style} />;
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
