// styled-components forwardedAs must be consumed by the generated wrapper, not forwarded to custom components.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

type EmphasisLabelProps = TextProps & { forwardedAs?: TextProps["as"] };

function EmphasisLabel(props: EmphasisLabelProps) {
  const { forwardedAs, ...rest } = props;
  return <Text {...rest} as={forwardedAs ?? rest.as} {...stylex.props(styles.emphasisLabel)} />;
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
