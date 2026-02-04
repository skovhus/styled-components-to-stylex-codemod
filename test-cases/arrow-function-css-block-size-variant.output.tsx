import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type Props = { size: "tiny" | "small" | "medium" };

type IndicatorProps = Omit<React.ComponentProps<"div">, "className" | "style"> & Props;

function Indicator(props: IndicatorProps) {
  const { children, size } = props;

  return <div {...stylex.props(styles.indicator, sizeVariants[size])}>{children}</div>;
}

export const App = () => (
  <div>
    <Indicator size="tiny" />
    <Indicator size="small" />
    <Indicator size="medium" />
  </div>
);

const styles = stylex.create({
  indicator: {
    borderRadius: "50%",
    backgroundColor: "green",
  },
});

const sizeVariants = stylex.create({
  tiny: {
    width: "7px",
    height: "7px",
  },
  small: {
    width: "10px",
    height: "10px",
  },
  medium: {
    width: "14px",
    height: "14px",
  },
});
