import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type DynamicFlexProps = React.ComponentPropsWithRef<"div"> & {
  align?: "start" | "center" | "end" | "stretch";
  gap?: number;
  inline?: boolean;
  justify?: "start" | "center" | "end" | "space-between";
  sx?: stylex.StyleXStyles;
};

export function DynamicFlex(props: DynamicFlexProps) {
  const { align, gap, inline, justify, sx, children, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.flex,
        inline && styles.flexInline,
        align != null && styles.align(align),
        justify != null && styles.justify(justify),
        gap != null && styles.gap(gap),
        sx,
      ]}
    >
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
  align: (alignItems: NonNullable<DynamicFlexProps["align"]>) => ({
    alignItems,
  }),
  justify: (justifyContent: NonNullable<DynamicFlexProps["justify"]>) => ({
    justifyContent,
  }),
  gap: (gap: number) => ({
    gap,
  }),
});
