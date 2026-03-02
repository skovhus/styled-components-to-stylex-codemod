import * as React from "react";
import type { __StylexCodemodOpaquePolymorphicProps } from "./stylex-codemod";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

type ContentProps<C extends React.ElementType = typeof Flex> =
  __StylexCodemodOpaquePolymorphicProps<React.ComponentPropsWithRef<typeof Flex>, C>;

function Content<C extends React.ElementType = typeof Flex>(props: ContentProps<C>) {
  const { as: Component = Flex, ...rest } = props;

  return <Component {...rest} {...stylex.props(styles.content)} />;
}

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <Content>Default Div</Content>
    <Content
      as="input"
      onChange={(e) => console.log("Changed to " + e.target.value)}
      value="Hello"
    />
  </div>
);

const styles = stylex.create({
  content: {
    backgroundColor: "cyan",
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#0aa",
  },
});
