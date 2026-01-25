import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContentViewContainerProps<C extends React.ElementType = "div"> = Omit<
  React.ComponentPropsWithoutRef<C>,
  "className" | "style"
> & { as?: C };

export function ContentViewContainer<C extends React.ElementType = "div">(
  props: ContentViewContainerProps<C>,
) {
  const { as: Component = "div", children, ...rest } = props;
  return (
    <Component {...rest} {...stylex.props(styles.contentViewContainer)}>
      {children}
    </Component>
  );
}

// When this is used externally we might both add a ref and use the "as"
// <ContentViewContainer ref={...} onClick={e => {}} >
export const App = () => <ContentViewContainer onClick={() => {}} />;

const styles = stylex.create({
  contentViewContainer: {
    display: "flex",
    flexGrow: 1,
    alignItems: "stretch",
    height: "100%",
    overflow: "hidden",
    position: "relative",
  },
});
