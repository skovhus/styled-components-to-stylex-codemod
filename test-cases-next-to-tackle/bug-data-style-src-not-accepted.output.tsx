import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Loading } from "./lib/loading";

export function StyledLoading(
  props: React.ComponentPropsWithRef<typeof Loading> & {
    className?: string;
    style?: React.CSSProperties;
  },
) {
  const { className, style, ...rest } = props;

  const sx = stylex.props(styles.loading);

  return (
    <Loading
      {...rest}
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
    />
  );
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
