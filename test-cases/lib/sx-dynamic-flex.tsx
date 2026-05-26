import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type DynamicFlexProps = React.ComponentPropsWithRef<"div"> & {
  inline?: boolean;
  sx?: stylex.StyleXStyles;
};

export function DynamicFlex(props: DynamicFlexProps) {
  const { inline, sx, children, ...rest } = props;
  return (
    <div {...rest} sx={[styles.flex, inline && styles.flexInline, sx]}>
      {children}
    </div>
  );
}

const styles = stylex.create({
  flex: {
    display: "flex",
    padding: 8,
  },
  flexInline: {
    display: "inline-flex",
  },
});
