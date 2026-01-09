import * as React from "react";
import styled from "styled-components";

// SpringValue simulates react-spring's animated value type
type SpringValue<T> = { get(): T };

// AnimatedSpanProps accepts SpringValue for style properties (like react-spring)
type AnimatedSpanProps = Omit<React.ComponentProps<"span">, "style"> & {
  style?: React.CSSProperties & { width?: number | string | SpringValue<number> };
};

// Simulates react-spring's animated component which accepts SpringValue in styles
const animated = {
  span: React.forwardRef<HTMLSpanElement, AnimatedSpanProps>((props, ref) => (
    <span ref={ref} {...props} style={props.style as React.CSSProperties} />
  )),
};

// When as={animated.span} is used, the component should render as animated.span
// This pattern is common with animation libraries like react-spring
const AnimatedText = styled.span`
  font-variant-numeric: tabular-nums;
  overflow: visible;
  display: inline-flex;
`;

type Props = {
  width: number | SpringValue<number>;
  children: React.ReactNode;
};

export function AnimatedNumber(props: Props) {
  const { width, children } = props;

  // When width is a SpringValue, we need to use animated.span
  const isAnimated = typeof width !== "number";

  if (isAnimated) {
    // This should work: animated.span accepts SpringValue<number> for width
    return (
      <AnimatedText as={animated.span} style={{ width }}>
        {children}
      </AnimatedText>
    );
  }

  return <AnimatedText style={{ width }}>{children}</AnimatedText>;
}

export const App = () => <AnimatedNumber width={100}>42</AnimatedNumber>;
