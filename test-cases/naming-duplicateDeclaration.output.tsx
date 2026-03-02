import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type SizeBoxProps<C extends React.ElementType = "div"> = Omit<
  React.ComponentPropsWithRef<C>,
  keyof (React.ComponentProps<"div"> & {
    $size: number;
  })
> &
  Omit<
    React.ComponentProps<"div"> & {
      $size: number;
    },
    "as"
  > & { sx?: stylex.StyleXStyles; as?: C };

/** A container that scales based on a dynamic size prop */
function SizeBox<C extends React.ElementType = "div">(
  props: {
    $size: number;
  } & Omit<
    React.ComponentPropsWithRef<C>,
    keyof {
      $size: number;
    }
  > & { sx?: stylex.StyleXStyles; as?: C },
) {
  const { as: Component = "div", className, children, style, ref, sx, $size, ...rest } = props;

  return (
    <Component
      ref={ref}
      {...rest}
      {...mergedSx(
        [
          styles.sizeBox,
          styles.sizeBoxWidth($size),
          styles.sizeBoxMaxWidth($size),
          styles.sizeBoxMaxHeight($size),
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
