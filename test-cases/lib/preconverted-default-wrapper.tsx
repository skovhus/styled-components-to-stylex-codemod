import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

function Box({ children }: { children: React.ReactNode }) {
  return <div {...stylex.props(styles.box)}>{children}</div>;
}

const LegacyPanel = styled.section`
  color: rebeccapurple;
`;

const styles = stylex.create({
  box: {
    backgroundColor: "papayawhip",
  },
});

export default React.memo(Box);
