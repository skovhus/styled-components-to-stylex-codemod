import React from "react";
import * as stylex from "@stylexjs/stylex";
import { wrapComponent } from "./lib/helpers";

const BaseComponent = (props: React.ComponentProps<"div">) => <div {...props} />;
const ComponentBaseComponent = wrapComponent(BaseComponent);
export const App = () => (
  <ComponentBaseComponent {...stylex.props(styles.wrappedStyled)}>Hello</ComponentBaseComponent>
);

const styles = stylex.create({
  // styled() wrapping a CallExpression (function call result)
  // The base component is `wrapComponent(BaseComponent)` which is a CallExpression
  wrappedStyled: {
    color: "red",
  },
});
