import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function ContentViewContainer<C extends React.ElementType = "div">(
  props: Omit<React.ComponentPropsWithRef<C>, "className" | "style"> & { as?: C },
) {
  const { as: Component = "div", children, ...rest } = props;

  return (
    <Component {...rest} {...stylex.props(styles.contentViewContainer)}>
      {children}
    </Component>
  );
}

// Pattern 2: styled(Component) with explicit props type that needs adapter-driven `as` support.
// The adapter returns { as: true } for this file, so the generated type must:
// 1. Include the user's explicit props (CustomProps)
// 2. Add the generic `as?: C` prop
// 3. Create a proper generic wrapper function
const BaseComponent = (props: React.ComponentProps<"div">) => <div {...props} />;

interface CustomProps {
  /** A custom prop specific to this wrapper */
  variant: "primary" | "secondary";
}

type StyledWrapperProps<C extends React.ElementType = typeof BaseComponent> =
  __StylexCodemodOpaquePolymorphicProps<
    React.ComponentPropsWithRef<typeof BaseComponent> & CustomProps,
    C
  >;

export function StyledWrapper<C extends React.ElementType = typeof BaseComponent>(
  props: StyledWrapperProps<C>,
) {
  const { as: Component = BaseComponent, variant, ...rest } = props;

  return (
    <Component
      {...rest}
      {...stylex.props(
        styles.styledWrapper,
        variant === "primary" && styles.styledWrapperVariantPrimary,
      )}
    />
  );
}

// When this is used externally we might both add a ref and use the "as"
// <ContentViewContainer ref={...} onClick={e => {}} >
export const App = () => (
  <>
    <ContentViewContainer onClick={() => {}} />
    <StyledWrapper variant="primary">Content</StyledWrapper>
  </>
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
  contentViewContainer: {
    display: "flex",
    flexGrow: 1,
    alignItems: "stretch",
    height: "100%",
    overflow: "hidden",
    position: "relative",
  },
  styledWrapper: {
    padding: "16px",
    backgroundColor: "gray",
  },
  styledWrapperVariantPrimary: {
    backgroundColor: "blue",
  },
});
