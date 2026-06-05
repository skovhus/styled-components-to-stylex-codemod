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
  const { as: Component = "div", className, style, sx, size, ...rest } = props;
  return (
    <Component
      {...rest}
      {...mergedSx(
        [
          styles.sizeBox,
          sizeVariants[size as keyof typeof sizeVariants] ?? styles.sizeBoxSize(size),
          sx,
        ],
        className,
        style,
      )}
    />
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
  sizeBoxSize: (size: number) => ({
    width: size,
    maxWidth: size,
    maxHeight: size,
  }),
});

const sizeVariants = stylex.create({
  60: {
    width: 60,
    maxWidth: 60,
    maxHeight: 60,
  },
  100: {
    width: 100,
    maxWidth: 100,
    maxHeight: 100,
  },
  140: {
    width: 140,
    maxWidth: 140,
    maxHeight: 140,
  },
});
