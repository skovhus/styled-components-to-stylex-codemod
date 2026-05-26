import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type DirectoryButtonProps = {
  sx?: stylex.StyleXStyles;
} & React.ComponentPropsWithRef<"button">;

export default function DirectoryButton(props: DirectoryButtonProps) {
  const { sx, ...rest } = props;
  return <button {...rest} sx={[styles.base, sx]} />;
}

const styles = stylex.create({
  base: {
    display: "inline-flex",
    padding: 4,
  },
});
