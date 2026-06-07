import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

export class Box extends React.Component<{ children: React.ReactNode }> {
  render() {
    return <div {...stylex.props(styles.box)}>{this.props.children}</div>;
  }
}

const LegacyPanel = styled.section`
  color: rebeccapurple;
`;

const styles = stylex.create({
  box: {
    backgroundColor: "papayawhip",
  },
});
