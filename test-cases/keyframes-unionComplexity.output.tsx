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

type LoaderCaretProps<C extends React.ElementType = "div"> = Omit<
  {
    delay?: number;
  },
  "as"
> &
  Omit<React.ComponentPropsWithRef<C>, "delay"> & { sx?: stylex.StyleXStyles; as?: C };

export function LoaderCaret<C extends React.ElementType = "div">(props: LoaderCaretProps<C>) {
  const { as: Component = "div", className, children, style, sx, delay, ...rest } = props;

  return (
    <Component
      {...rest}
      {...mergedSx(
        [
          styles.loaderCaret({
            animationDelay: `${delay ?? 1000}ms`,
          }),
          sx,
        ],
        className,
        style,
      )}
    >
      {children}
    </Component>
  );
}

type StyledLoaderCaretProps = { noPadding?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof LoaderCaret>,
  "className" | "style"
>;

function StyledLoaderCaret(props: StyledLoaderCaretProps) {
  const { noPadding, ...rest } = props;

  return (
    <LoaderCaret
      {...rest}
      {...stylex.props(styles.styledLoaderCaret, noPadding && styles.styledLoaderCaretNoPadding)}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
    <div>
      <p>LoaderCaret:</p>
      <LoaderCaret delay={0} />
    </div>
    <div style={{ position: "relative", height: 40 }}>
      <p>StyledLoaderCaret:</p>
      <StyledLoaderCaret $delay={500} />
    </div>
  </div>
);

const styles = stylex.create({
  loaderCaret: (props: { animationDelay: string }) => ({
    width: 8,
    height: 16,
    borderRadius: 2,
    backgroundColor: "blue",
    opacity: 0,
    animationName: pulse,
    animationDuration: "2000ms",
    animationIterationCount: "infinite",
    animationTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    animationDelay: props.animationDelay,
  }),
  styledLoaderCaret: {
    position: "absolute",
    top: 11,
    left: "10px",
  },
  styledLoaderCaretNoPadding: {
    left: "0",
  },
});
