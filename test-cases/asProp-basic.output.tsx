import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Text } from "./lib/text";

// Pattern 1: styled.element with as prop at call site
function Button<C extends React.ElementType = "button">(
  props: Omit<React.ComponentPropsWithRef<C>, "className" | "style"> & { as?: C },
) {
  const { as: Component = "button", children, ...rest } = props;

  return (
    <Component {...rest} {...stylex.props(styles.button)}>
      {children}
    </Component>
  );
}

type StyledTextProps<C extends React.ElementType = typeof Text> =
  __StylexCodemodOpaquePolymorphicProps<React.ComponentPropsWithRef<typeof Text>, C>;

// Pattern 2: styled(Component) where Component has custom props (like variant)
// When used with as="label", the component's props must be preserved
function StyledText<C extends React.ElementType = typeof Text>(props: StyledTextProps<C>) {
  const { as: Component = Text, ...rest } = props;

  return <Component {...rest} {...stylex.props(styles.text)} />;
}

export const App = () => (
  <div>
    <Button>Normal Button</Button>
    <Button as="a" href="#">
      Link with Button styles
    </Button>
    {/* Pattern 2: styled(Component) with as prop */}
    <StyledText variant="small" color="muted">
      Normal styled text
    </StyledText>
    {/* Pattern 3: as="label" with label-specific props like htmlFor */}
    <StyledText variant="mini" as="label" htmlFor="my-input">
      Label using Text styles
    </StyledText>
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
  button: {
    display: "inline-block",
    color: "#bf4f74",
    fontSize: "1em",
    margin: "1em",
    paddingBlock: "0.25em",
    paddingInline: "1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#bf4f74",
    borderRadius: "3px",
  },

  // Pattern 2: styled(Component) where Component has custom props (like variant)
  // When used with as="label", the component's props must be preserved
  text: {
    marginTop: "4px",
  },
});
