import * as React from "react";
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
type __StylexCodemodFastOmit<T, K extends PropertyKey> = Omit<T, K>;
type __StylexCodemodSubstitute<A, B> = __StylexCodemodFastOmit<A, keyof B> & B;
type __StylexCodemodAsTargetProps<C extends React.ElementType> = __StylexCodemodFastOmit<
  React.ComponentPropsWithRef<C>,
  "className" | "style" | "as" | "forwardedAs"
>;
type __StylexCodemodOpaquePolymorphicProps<
  BaseProps,
  C extends React.ElementType,
  ForwardedAsC extends React.ElementType | void = void,
> = NoInfer<
  [ForwardedAsC] extends [React.ElementType]
    ? __StylexCodemodSubstitute<
        BaseProps,
        __StylexCodemodSubstitute<
          __StylexCodemodAsTargetProps<ForwardedAsC>,
          __StylexCodemodAsTargetProps<C>
        >
      >
    : __StylexCodemodSubstitute<BaseProps, __StylexCodemodAsTargetProps<C>>
> & { as?: C } & ([ForwardedAsC] extends [React.ElementType] ? { forwardedAs?: ForwardedAsC } : {});

const styles = stylex.create({
  content: {
    backgroundColor: "cyan",
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#0aa",
  },
});
