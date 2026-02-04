import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Support helper calls that depend on a prop value:
//   box-shadow: ${(props) => shadow(props.shadow)};

export function shadow(value: string): string {
  return `10px 10px 10px ${value}`;
}

type BoxProps = React.PropsWithChildren<{
  shadow: string;
}>;

export function Box(props: BoxProps) {
  const { children, shadow } = props;

  return <div {...stylex.props(styles.box, styles.boxBoxShadow(shadow))}>{children}</div>;
}

export const App = () => <Box shadow="rgba(0,0,0,0.2)" />;

const styles = stylex.create({
  box: {
    height: "50px",
    width: "50px",
  },
  boxBoxShadow: (boxShadow: string) => ({
    boxShadow: shadow(boxShadow),
  }),
});
