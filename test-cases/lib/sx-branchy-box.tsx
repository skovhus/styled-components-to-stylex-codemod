import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type BranchyBoxProps = {
  bare?: boolean;
  sx?: stylex.StyleXStyles;
} & React.ComponentPropsWithRef<"div">;

export function BranchyBox(props: BranchyBoxProps) {
  const { bare, sx, ...rest } = props;
  if (bare) {
    return <div {...rest} sx={sx} />;
  }
  return <div {...rest} sx={[styles.base, sx]} />;
}

const styles = stylex.create({
  base: {
    display: "flex",
    padding: 4,
  },
});
