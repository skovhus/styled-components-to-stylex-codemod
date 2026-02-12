import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

const pulse = stylex.keyframes({
  "0%,40%,100%": {
    opacity: 1,
  },

  "50%,90%": {
    opacity: 0.2,
  },
});

type LoaderCaretProps<C extends React.ElementType = "div"> = React.ComponentPropsWithRef<C> &
  Omit<
    React.ComponentProps<"div"> & {
      $delay?: number;
    },
    "as"
  > & { as?: C };

export function LoaderCaret<C extends React.ElementType = "div">(
  props: {
    $delay?: number;
  } & React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "div", className, children, style, $delay, ...rest } = props;

  return (
    <Component
      {...rest}
      {...mergedSx(
        [styles.loaderCaret, styles.loaderCaretAnimationDelay(`${$delay ?? 1000}ms`)],
        className,
        style,
      )}
    >
      {children}
    </Component>
  );
}

type StyledLoaderCaretProps = Omit<
  React.ComponentPropsWithRef<typeof LoaderCaret>,
  "className" | "style"
> & {
  $noPadding?: boolean;
};

function StyledLoaderCaret(props: StyledLoaderCaretProps) {
  const { $noPadding, $delay, children, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.loaderCaret,
        styles.loaderCaretAnimationDelay(`${$delay ?? 1000}ms`),
        styles.styledLoaderCaret,
        $noPadding ? styles.styledLoaderCaretNoPadding : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
    <div>
      <p>LoaderCaret:</p>
      <LoaderCaret $delay={0} />
    </div>
    <div style={{ position: "relative", height: 40 }}>
      <p>StyledLoaderCaret:</p>
      <StyledLoaderCaret $delay={500} />
    </div>
  </div>
);

const styles = stylex.create({
  loaderCaret: {
    width: "8px",
    height: "16px",
    borderRadius: "2px",
    backgroundColor: "blue",
    opacity: 0,
    animationName: pulse,
    animationDuration: "2000ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    animationDelay: "1000ms",
  },
  loaderCaretAnimationDelay: (animationDelay: string) => ({
    animationDelay,
  }),
  styledLoaderCaret: {
    position: "absolute",
    top: "11px",
    left: "10px",
  },
  styledLoaderCaretNoPadding: {
    left: "0",
  },
});
