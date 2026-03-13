import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type SizeBoxProps<C extends React.ElementType = "div"> = Omit<
  {
    size: number;
  },
  "as"
> &
  Omit<React.ComponentPropsWithRef<C>, "size"> & { sx?: stylex.StyleXStyles; as?: C };

/** A container that scales based on a dynamic size prop */
function SizeBox<C extends React.ElementType = "div">(props: SizeBoxProps<C>) {
  const { as: Component = "div", className, children, style, ref, sx, size, ...rest } = props;

  return (
    <Component
      ref={ref}
      {...rest}
      {...mergedSx(
        [
          styles.sizeBox,
          styles.sizeBoxSize({
            size: size,
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

export { SizeBox };

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "center" }}>
    <SizeBox size={60}>60</SizeBox>
    <SizeBox size={100}>100</SizeBox>
    <SizeBox size={140}>140</SizeBox>
  </div>
);

const styles = stylex.create({
  sizeBox: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: "cornflowerblue",
    padding: 8,
    color: "white",
  },
  sizeBoxSize: (props: { size: number }) => ({
    width: `${props.size}px`,
    maxWidth: `${props.size}px`,
    maxHeight: `${props.size}px`,
  }),
});
