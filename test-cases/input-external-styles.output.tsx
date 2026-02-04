import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export function StyledInput<C extends React.ElementType = "input">(
  props: React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "input", className, children, style, ...rest } = props;
  return (
    <Component {...rest} {...mergedSx(styles.styledInput, className, style)}>
      {children}
    </Component>
  );
}

// Usage: should pass through all input props
export const App = () => (
  <>
    <StyledInput placeholder="Type here" value="hello" onChange={() => {}} />
    <StyledInput as="textarea" placeholder="Textarea mode" />
    {/* Children should be forwarded when using as prop with non-void element */}
    <StyledInput as="button">Click me</StyledInput>
  </>
);

const styles = stylex.create({
  styledInput: {
    transitionProperty: "color",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "blue",
  },
});
