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

type PositionBaseProps<C extends React.ElementType = "div"> = React.ComponentPropsWithRef<C> &
  Omit<React.PropsWithChildren<PositionProps>, "as"> & { as?: C };

function PositionBase<C extends React.ElementType = "div">(
  props: PositionProps & React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "div", className, children, style, top, right, bottom, left } = props;

  return (
    <Component
      {...mergedSx(
        [
          top ? styles.positionBaseTop(top) : undefined,
          right ? styles.positionBaseRight(right) : undefined,
          bottom ? styles.positionBaseBottom(bottom) : undefined,
          left ? styles.positionBaseLeft(left) : undefined,
        ],
        className,
        style,
      )}
    >
      {children}
    </Component>
  );
}

type RelativeProps = Omit<React.ComponentPropsWithRef<typeof PositionBase>, "className" | "style">;

/** A relatively positioned container. */
export function Relative(props: RelativeProps) {
  return <PositionBase {...props} {...stylex.props(styles.relative)} />;
}

type AbsoluteProps = Omit<React.ComponentPropsWithRef<typeof PositionBase>, "className" | "style">;

/** An absolutely positioned container. */
export function Absolute(props: AbsoluteProps) {
  return <PositionBase {...props} {...stylex.props(styles.absolute)} />;
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
