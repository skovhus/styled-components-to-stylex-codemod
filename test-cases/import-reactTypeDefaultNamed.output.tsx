// React type imports must not be merged into invalid default-plus-named type import syntax.
import type React from "react";
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";

type MessageProps = {
  children?: React.ReactNode;
  style?: CSSProperties;
};

function Message(props: MessageProps) {
  const { children, style } = props;
  return (
    <div sx={styles.message} style={style}>
      {children}
    </div>
  );
}

export const App = () => <Message style={{ color: "#166534" }}>Typed message</Message>;

const styles = stylex.create({
  message: {
    padding: 8,
    backgroundColor: "#dcfce7",
  },
});
