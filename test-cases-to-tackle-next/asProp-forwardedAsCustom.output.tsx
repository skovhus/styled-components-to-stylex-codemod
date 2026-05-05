import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type TextProps = React.PropsWithChildren<{
  as?: "span" | "strong";
  className?: string;
  style?: React.CSSProperties;
}>;

function Text(props: TextProps) {
  const { as: Component = "span", children, className, style } = props;
  return (
    <Component className={className} style={style}>
      {children}
    </Component>
  );
}

type EmphasisLabelProps = TextProps & {
  forwardedAs?: TextProps["as"];
};

function EmphasisLabel(props: EmphasisLabelProps) {
  const { children, className, forwardedAs, style, ...rest } = props;
  return (
    <Text
      {...rest}
      as={forwardedAs ?? rest.as}
      {...mergedSx(styles.emphasisLabel, className, style)}
    >
      {children}
    </Text>
  );
}

export const App = () => (
  <div style={{ padding: 12 }}>
    <EmphasisLabel forwardedAs="strong">Important label</EmphasisLabel>
  </div>
);

const styles = stylex.create({
  emphasisLabel: {
    color: "#7c2d12",
    fontWeight: 600,
  },
});
