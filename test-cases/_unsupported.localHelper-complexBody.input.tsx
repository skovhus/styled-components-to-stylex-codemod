// @expected-warning: Local helper function computes CSS values that cannot be statically traced to the component prop
import * as React from "react";
import styled from "styled-components";

type Size = "small" | "medium" | "large";

function computeSize(size: Size): string {
  let width = 16;
  let height = 16;
  if (size === "medium") {
    width = 24;
    height = 24;
  } else if (size === "large") {
    width = 32;
    height = 32;
  }
  return `
    width: ${width}px;
    height: ${height}px;
  `;
}

const Box = styled.div<{ size: Size }>`
  display: flex;
  ${(props) => computeSize(props.size)}
`;
