import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ContainerProps = Omit<React.HTMLAttributes<HTMLDivElement>, "className"> & {
  align: string;
};

// When a local variable named `styles` exists, the generated stylex constant
// should use a different name to avoid shadowing.

function Container(props: ContainerProps) {
  const { children, style, ...rest } = props;
  return (
    <div {...rest} {...mergedSx(stylexStyles.container, undefined, style)}>
      {children}
    </div>
  );
}

interface Props {
  containerStyles?: React.CSSProperties;
  align?: "top" | "center" | "bottom";
  children: React.ReactNode;
}

export function CollapsingContainer(props: Props) {
  const { containerStyles, align = "top", children } = props;

  // Local variable named "styles" - common pattern in animation components
  const styles = containerStyles
    ? {
        overflow: "hidden",
        ...containerStyles,
      }
    : { overflow: "hidden" };
  return (
    <Container align={align} style={styles}>
      {children}
    </Container>
  );
}

export const App = () => (
  <CollapsingContainer containerStyles={{ padding: 10 }}>Content</CollapsingContainer>
);

const stylexStyles = stylex.create({
  container: {
    position: "relative",
    flexShrink: 0,
  },
});
