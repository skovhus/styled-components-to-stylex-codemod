import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

type HeaderTitleProps<C extends React.ElementType = typeof Text> = NoInfer<
  Omit<
    React.ComponentPropsWithRef<typeof Text>,
    keyof Omit<React.ComponentPropsWithRef<C>, "className" | "style" | "as" | "forwardedAs">
  > &
    Omit<React.ComponentPropsWithRef<C>, "className" | "style" | "as" | "forwardedAs">
> & { as?: C };

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
