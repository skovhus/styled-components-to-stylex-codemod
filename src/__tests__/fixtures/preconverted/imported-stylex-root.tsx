import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { Base } from "./base-mixed";

export function Box({ children }: { children: React.ReactNode }) {
  return <Base {...stylex.props(styles.box)}>{children}</Base>;
}

const _UnrelatedLocal = styled.div`
  padding: 4px;
`;

const styles = stylex.create({
  box: {
    borderColor: "black",
  },
});
