import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface Props {
  containerStyles?: React.CSSProperties;
  children: React.ReactNode;
}

export function CollapsingContainer(props: Props) {
  const { containerStyles, children } = props;

  // Local variable named "styles" - common pattern in animation components
  const styles = containerStyles
    ? {
        overflow: "hidden",
        ...containerStyles,
      }
    : { overflow: "hidden" };
  return <div {...stylex.props(stylexStyles.container)}>{children}</div>;
}

export const App = () => (
  <CollapsingContainer containerStyles={{ padding: 10 }}>Content</CollapsingContainer>
);

const stylexStyles = stylex.create({
  // When a local variable named `styles` exists, the generated stylex constant
  // should use a different name to avoid shadowing.

  container: {
    position: "relative",
    flexShrink: 0,
  },
});
