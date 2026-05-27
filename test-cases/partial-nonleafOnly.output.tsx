import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import styled from "styled-components";

function Base<C extends React.ElementType = "div">(
  props: React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles } & { as?: C },
) {
  const { as: Component = "div", className, style, sx, ...rest } = props;
  return <Component {...rest} {...mergedSx([styles.base, sx], className, style)} />;
}

const Derived = styled(Base)`
  color: tomato;

  & a.active {
    color: gold;
  }
`;

export const App = () => (
  <div>
    <Base>base</Base>
    <Derived>
      <a className="active" href="#">
        derived
      </a>
    </Derived>
  </div>
);

const styles = stylex.create({
  base: {
    color: "navy",
    padding: 8,
  },
});
