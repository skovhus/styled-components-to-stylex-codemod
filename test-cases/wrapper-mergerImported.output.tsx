import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { Loading } from "./lib/loading";

export function StyledLoading(
  props: React.ComponentPropsWithRef<typeof Loading> & {
    className?: string;
    style?: React.CSSProperties;
    sx?: stylex.StyleXStyles | stylex.StyleXStyles[];
  },
) {
  const { className, style, sx, ...rest } = props;

  return <Loading {...rest} {...mergedSx([styles.loading, sx], className, style)} />;
}

export const App = () => (
  <div>
    <StyledLoading size="large" text="Loading settings…" />
    <StyledLoading size="small" text={false} />
  </div>
);

const styles = stylex.create({
  loading: {
    height: "100%",
    flexDirection: "column",
    gap: "8px",
    flex: "1",
  },
});
