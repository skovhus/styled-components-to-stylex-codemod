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
  React.ComponentPropsWithRef<typeof BaseComponent> &
    Omit<
      React.ComponentPropsWithRef<C>,
      keyof React.ComponentPropsWithRef<typeof BaseComponent> | "className" | "style"
    > & {
      as?: C;
    } & CustomProps;

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
