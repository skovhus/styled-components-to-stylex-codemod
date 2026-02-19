import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// SpringValue simulates react-spring's animated value type
// Intersected with T so it's assignable to CSS property types (e.g., Width)
type SpringValue<T> = T & { get(): T };

// AnimatedSpanProps accepts SpringValue for style properties (like react-spring)
type AnimatedSpanProps = Omit<React.ComponentProps<"span">, "style"> & {
  // Note: `React.CSSProperties & { width?: ... }` would INTERSECT `width` types and
  // accidentally exclude SpringValue. Omit first to properly widen.
  style?: Omit<React.CSSProperties, "width"> & {
    width?: number | string | SpringValue<number>;
  };
};

// Simulates react-spring's animated component which accepts SpringValue in styles
const animated = {
  span: React.forwardRef<HTMLSpanElement, AnimatedSpanProps>((props, ref) => (
    <span ref={ref} {...props} style={props.style as React.CSSProperties} />
  )),
};

function AnimatedText<C extends React.ElementType = "span">(
  props: Omit<React.ComponentPropsWithRef<C>, "className"> & { as?: C },
) {
  const { as: Component = "span", children, style, ...rest } = props;

  return (
    <Component {...rest} {...mergedSx(styles.animatedText, undefined, style)}>
      {children}
    </Component>
  );
}

type Props = {
  width: number | SpringValue<number>;
  children: React.ReactNode;
};

export function AnimatedNumber(props: Props) {
  const { width, children } = props;
  const spanRef = React.useRef<HTMLSpanElement>(null);

  // When width is a SpringValue, we need to use animated.span
  const isAnimated = typeof width !== "number";

  if (isAnimated) {
    // This should work: animated.span accepts SpringValue<number> for width
    // The ref should also be accepted since animated.span forwards refs
    return (
      <AnimatedText as={animated.span} ref={spanRef} style={{ width }}>
        {children}
      </AnimatedText>
    );
  }

  // ref should work on the default span element too
  return (
    <AnimatedText ref={spanRef} style={{ width }}>
      {children}
    </AnimatedText>
  );
}

export const App = () => <AnimatedNumber width={100}>42</AnimatedNumber>;

const styles = stylex.create({
  animatedText: {
    fontVariantNumeric: "tabular-nums",
    overflow: "visible",
    display: "inline-flex",
  },
});
