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
  const { children, shadow, ...rest } = props;
  return (
    <div {...rest} sx={styles.box(shadow)}>
      {children}
    </div>
  );
}

export const App = () => <Box shadow="rgba(0,0,0,0.2)">Shadow</Box>;

const styles = stylex.create({
  box: (boxShadow: string) => ({
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#fed7aa",
    display: "flex",
    height: 50,
    justifyContent: "center",
    width: 50,
    boxShadow: shadow(boxShadow),
  }),
});
