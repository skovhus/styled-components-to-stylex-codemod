import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Loading } from "./lib/loading";

// Bug: When an exported styled() wraps a component whose props do NOT include
// className (e.g. Loading only accepts style/size/text), the codemod creates a
// wrapper that forwards className explicitly to the base component, causing TS2322.
// styled-components handled this internally, but the wrapper exposes the mismatch.

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
