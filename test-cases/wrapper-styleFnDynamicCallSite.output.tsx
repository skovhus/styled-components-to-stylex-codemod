import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type LayoutProps = { windowHeight: number } & Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style"
>;

function Layout(props: LayoutProps) {
  return <Flex {...props} {...stylex.props(styles.layoutMarginTop(props.windowHeight))} />;
}

export const App = (props: { windowHeight: number }) => (
  <Layout windowHeight={props.windowHeight}>Content</Layout>
);

const styles = stylex.create({
  layoutMarginTop: (windowHeight: number) => ({
    marginTop: (windowHeight - 400) / 2,
  }),
});
