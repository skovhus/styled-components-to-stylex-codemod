import * as stylex from "@stylexjs/stylex";
import * as React from "react";
import styled from "styled-components";

export function Box({ children }: { children: React.ReactNode }) {
  return <LegacyPanel {...stylex.props(styles.box)}>{children}</LegacyPanel>;
}

const LegacyPanel = styled.section`
  color: rebeccapurple;
`;

const styles = stylex.create({
  box: {
    backgroundColor: "papayawhip",
  },
});
