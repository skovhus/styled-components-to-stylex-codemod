import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

type ContainerProps<C extends React.ElementType = typeof Flex> =
  __StylexCodemodOpaquePolymorphicProps<React.ComponentPropsWithRef<typeof Flex>, C>;

function Container<C extends React.ElementType = typeof Flex>(props: ContainerProps<C>) {
  const { as: Component = Flex, ...rest } = props;

  return <Component {...rest} column={true} {...stylex.props(styles.container)} />;
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Default</Container>
      <Container as="span">As span</Container>
    </div>
  );
}
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
  container: {
    padding: "8px",
    backgroundColor: "#eef",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#667",
  },
});
