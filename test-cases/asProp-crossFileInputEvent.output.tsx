import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

type ContentProps<C extends React.ElementType = typeof Flex> = NoInfer<
  Omit<
    React.ComponentPropsWithRef<typeof Flex>,
    keyof Omit<React.ComponentPropsWithRef<C>, "className" | "style" | "as" | "forwardedAs">
  > &
    Omit<React.ComponentPropsWithRef<C>, "className" | "style" | "as" | "forwardedAs">
> & { as?: C };

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
