import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

export function Base({ children }: { children: React.ReactNode }) {
  return <div {...stylex.props(styles.base)}>{children}</div>;
}

const _LegacyBase = styled.section`
  color: rebeccapurple;
`;

const styles = stylex.create({
  base: {
    backgroundColor: "papayawhip",
  },
});
