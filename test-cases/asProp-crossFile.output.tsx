import * as React from "react";
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
  headerTitle: {
    fontSize: "24px",
    fontWeight: 600,
  },
});
