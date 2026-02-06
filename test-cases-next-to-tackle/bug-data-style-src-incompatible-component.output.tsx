import React from "react";
import * as stylex from "@stylexjs/stylex";

function Button(props: { onClick: () => void; children: React.ReactNode; variant?: string }) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

export function StyledButton(
  props: React.ComponentPropsWithRef<typeof Button> & {
    className?: string;
    style?: React.CSSProperties;
  },
) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.button);

  return (
    <Button
      {...rest}
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </Button>
  );
}

export const App = () => (
  <StyledButton onClick={() => {}} variant="primary">
    Click me
  </StyledButton>
);

const styles = stylex.create({
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "4px",
    backgroundColor: "blue",
    color: "white",
  },
});
