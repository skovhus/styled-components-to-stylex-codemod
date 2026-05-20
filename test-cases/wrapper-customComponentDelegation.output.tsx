// Styled wrappers around sx-aware custom components must delegate generated styles via sx.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type SurfaceBaseProps = React.ComponentPropsWithRef<"section"> & {
  sx?: stylex.StyleXStyles;
};

function SurfaceBase(props: SurfaceBaseProps) {
  const { sx, ...rest } = props;
  return <section {...rest} sx={sx} />;
}

export function RelativeSurface(
  props: { sx?: stylex.StyleXStyles } & Omit<
    React.ComponentPropsWithRef<typeof SurfaceBase>,
    "className" | "style"
  >,
) {
  const { children, sx, ...rest } = props;
  return (
    <SurfaceBase {...rest} sx={[styles.relativeSurface, sx]}>
      {children}
    </SurfaceBase>
  );
}

export const App = () => <RelativeSurface>Relative surface</RelativeSurface>;

const styles = stylex.create({
  relativeSurface: {
    position: "relative",
    padding: 12,
    backgroundColor: "#f8fafc",
  },
});
