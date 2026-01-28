import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type StyledInputProps<C extends React.ElementType = "input"> = React.ComponentPropsWithoutRef<C> & {
  as?: C;
};

export function StyledInput<C extends React.ElementType = "input">(props: StyledInputProps<C>) {
  const { as: Component = "input", className, style, ...rest } = props;
  return <Component {...rest} {...mergedSx(styles.styledInput, className, style)} />;
}

// Usage: should pass through all input props
export const App = () => (
  <>
    <StyledInput placeholder="Type here" value="hello" onChange={() => {}} />
    <StyledInput as="textarea" placeholder="Textarea mode" />
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
