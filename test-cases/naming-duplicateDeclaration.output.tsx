import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type SizeBoxProps<C extends React.ElementType = "div"> = React.ComponentPropsWithRef<C> &
  Omit<
    React.ComponentProps<"div"> & {
      $size: number;
    },
    "as"
  > & { as?: C };

/** A container that scales based on a dynamic size prop */
function SizeBox<C extends React.ElementType = "div">(
  props: {
    $size: number;
  } & React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "div", className, children, style, $size, ...rest } = props;

  return (
    <Component
      {...rest}
      {...mergedSx(
        [
          styles.sizeBox,
          styles.sizeBoxWidth($size),
          styles.sizeBoxMaxWidth($size),
          styles.sizeBoxMaxHeight($size),
        ],
        className,
        style,
      )}
    >
      {children}
    </Component>
  );
}

export { SizeBox };

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "center" }}>
    <SizeBox $size={60}>60</SizeBox>
    <SizeBox $size={100}>100</SizeBox>
    <SizeBox $size={140}>140</SizeBox>
  </div>
);

const styles = stylex.create({
  /** A container that scales based on a dynamic size prop */
  sizeBox: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: "cornflowerblue",
    padding: "8px",
    color: "white",
  },
  sizeBoxWidth: (width: number) => ({
    width: `${width}px`,
  }),
  sizeBoxMaxWidth: (maxWidth: number) => ({
    maxWidth: `${maxWidth}px`,
  }),
  sizeBoxMaxHeight: (maxHeight: number) => ({
    maxHeight: `${maxHeight}px`,
  }),
});
