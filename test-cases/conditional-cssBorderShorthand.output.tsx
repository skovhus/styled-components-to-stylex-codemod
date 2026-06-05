// Conditional `css\`...\`` block (logical-AND, inside a styled component) that
// adds a shorthand border property `border-bottom: 1px solid <theme color>`.
// The shorthand needs to be expanded into longhand StyleX properties
// (borderBottomWidth/Style/Color), but on the conditional-css-block path the
// codemod skips that expansion and throws
// `Unexpanded CSS shorthand "borderBottom"`.
//
// Regression repro for conditional css blocks with interpolated border shorthands.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type ContainerProps = React.PropsWithChildren<{
  hideBottomBorder?: boolean;
}>;

function Container(props: ContainerProps) {
  const { children, hideBottomBorder } = props;
  return (
    <div sx={[styles.container, !hideBottomBorder && styles.containerNotHideBottomBorder]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Container>Default (has bottom border)</Container>
    <Container hideBottomBorder>No bottom border</Container>
  </div>
);

const styles = stylex.create({
  container: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: $colors.bgBorderFaint,
    padding: 8,
  },
  containerNotHideBottomBorder: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: $colors.bgBorderFaint,
  },
});
