import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

/** Props for position-based styled components. */
interface PositionProps {
  /** Top position value. */
  top?: string;
  /** Right position value. */
  right?: string;
  /** Bottom position value. */
  bottom?: string;
  /** Left position value. */
  left?: string;
}

function PositionBase<C extends React.ElementType = "div">(
  props: PositionProps &
    Omit<React.ComponentPropsWithRef<C>, keyof PositionProps> & {
      sx?: stylex.StyleXStyles;
      as?: C;
    },
) {
  const {
    as: Component = "div",
    className,
    children,
    style,
    sx,
    top,
    right,
    bottom,
    left,
    ...rest
  } = props;
  return (
    <Component
      {...rest}
      {...mergedSx(
        [
          top ? styles.positionBaseTop(top) : undefined,
          right ? styles.positionBaseRight(right) : undefined,
          bottom ? styles.positionBaseBottom(bottom) : undefined,
          left ? styles.positionBaseLeft(left) : undefined,
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

/** A relatively positioned container. */
export function Relative(
  props: Omit<React.ComponentPropsWithRef<typeof PositionBase>, "className" | "style">,
) {
  const { children, sx, ...rest } = props;
  return (
    <PositionBase {...rest} sx={[styles.relative, sx]}>
      {children}
    </PositionBase>
  );
}

/** An absolutely positioned container. */
export function Absolute(
  props: Omit<React.ComponentPropsWithRef<typeof PositionBase>, "className" | "style">,
) {
  const { children, sx, ...rest } = props;
  return (
    <PositionBase {...rest} sx={[styles.absolute, sx]}>
      {children}
    </PositionBase>
  );
}

export function App() {
  return (
    <div>
      <Relative top="10px" left="20px">
        Relative
      </Relative>
      <Absolute right="50px" bottom="15px">
        Absolute
      </Absolute>
    </div>
  );
}

const styles = stylex.create({
  positionBaseTop: (top: string) => ({
    top,
  }),
  positionBaseRight: (right: string) => ({
    right,
  }),
  positionBaseBottom: (bottom: string) => ({
    bottom,
  }),
  positionBaseLeft: (left: string) => ({
    left,
  }),
  relative: {
    position: "relative",
  },
  absolute: {
    position: "absolute",
  },
});
