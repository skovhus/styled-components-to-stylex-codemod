import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type DefaultButtonProps = {
  sx?: stylex.StyleXStyles;
} & React.ComponentPropsWithRef<"button">;

export default function Button(props: DefaultButtonProps) {
  const { sx, ...rest } = props;
  return <button {...rest} sx={[styles.base, sx]} />;
}

const styles = stylex.create({
  base: {
    display: "flex",
    padding: 4,
  },
});
