import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type BoxProps = { highlight?: boolean } & React.ComponentProps<"div"> & {
    sx?: stylex.StyleXStyles;
  };

export function Box(props: BoxProps) {
  const { className, children, style, sx, highlight, ...rest } = props;
  const _sx = stylex.props(styles.box, highlight && styles.boxHighlight, sx);

  return (
    <div
      {...rest}
      {..._sx}
      className={[_sx.className, className].filter(Boolean).join(" ")}
      style={{
        ..._sx.style,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Multiple call sites force the codemod to emit a function wrapper instead of inlining.
export const App = () => (
  <>
    <Box>one</Box>
    <Box highlight>two</Box>
  </>
);

const styles = stylex.create({
  box: {
    padding: 8,
  },
  boxHighlight: {
    backgroundColor: "yellow",
  },
});
