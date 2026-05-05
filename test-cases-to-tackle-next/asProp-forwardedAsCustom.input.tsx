// styled-components forwardedAs must be consumed by the generated wrapper, not forwarded to custom components.
import * as React from "react";
import styled from "styled-components";

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

const EmphasisLabel = styled(Text)`
  color: #7c2d12;
  font-weight: 600;
`;

export const App = () => (
  <div style={{ padding: 12 }}>
    <EmphasisLabel forwardedAs="strong">Important label</EmphasisLabel>
  </div>
);
