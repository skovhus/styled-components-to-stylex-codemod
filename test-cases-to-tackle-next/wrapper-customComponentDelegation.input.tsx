// Styled wrappers around sx-aware custom components must delegate generated styles via sx.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

type SurfaceBaseProps = React.ComponentPropsWithRef<"section"> & {
  sx?: stylex.StyleXStyles;
};

function SurfaceBase(props: SurfaceBaseProps) {
  const { sx, ...rest } = props;
  return <section {...rest} sx={sx} />;
}

export const RelativeSurface = styled(SurfaceBase)`
  position: relative;
  padding: 12px;
  background: #f8fafc;
`;

export const App = () => <RelativeSurface>Relative surface</RelativeSurface>;
