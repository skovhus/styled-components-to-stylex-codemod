import * as React from "react";
import type { __StylexCodemodOpaquePolymorphicProps } from "./stylex-codemod";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

type HeaderTitleProps<C extends React.ElementType = typeof Text> =
  __StylexCodemodOpaquePolymorphicProps<React.ComponentPropsWithRef<typeof Text>, C>;

export function HeaderTitle<C extends React.ElementType = typeof Text>(props: HeaderTitleProps<C>) {
  const { as: Component = Text, ...rest } = props;

  return <Component {...rest} {...stylex.props(styles.headerTitle)} />;
}

export const App = () => (
  <div>
    <HeaderTitle variant="large">Default Title</HeaderTitle>
  </div>
);

const styles = stylex.create({
  headerTitle: {
    fontSize: "24px",
    fontWeight: 600,
  },
});
