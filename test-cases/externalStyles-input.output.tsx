import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

/**
 * Test case for styled.input with externalInterface: style: true (without .attrs)
 *
 * Key issues to test:
 * 1. Rest props should be forwarded to the input element
 * 2. The "as" prop should be allowed (for polymorphism)
 * 3. External styles (className, style) should be supported
 */
export function StyledInput<C extends React.ElementType = "input">(
  props: React.ComponentPropsWithRef<C> & {
    sx?: stylex.StyleXStyles;
    as?: C;
  },
) {
  const { as: Component = "input", className, children, style, sx, ...rest } = props;
  return (
    <Component {...rest} {...mergedSx([styles.input, sx], className, style)}>
      {children}
    </Component>
  );
}

// Usage: should pass through all input props
export const App = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <StyledInput ref={inputRef} placeholder="Type here" value="hello" onChange={() => {}} />
      <StyledInput as="textarea" placeholder="Textarea mode" />
      {/* Children should be forwarded when using as prop with non-void element */}
      <StyledInput as="button">Click me</StyledInput>
    </>
  );
};

const styles = stylex.create({
  input: {
    transitionProperty: "color",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "blue",
  },
});
