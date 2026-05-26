import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type DefaultIdentifierButtonProps = {
  sx?: React.ComponentPropsWithRef<"button">["sx"];
} & React.ComponentPropsWithRef<"button">;

function Button(props: DefaultIdentifierButtonProps) {
  const { sx, ...rest } = props;
  return <button {...rest} sx={[styles.base, sx]} />;
}

const styles = stylex.create({
  base: {
    display: "flex",
    padding: 4,
  },
});

export default Button;
