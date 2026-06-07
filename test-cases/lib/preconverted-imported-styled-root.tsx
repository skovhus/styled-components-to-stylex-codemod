import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { GroupHeader } from "./styled-group-header";

export function Box({ children }: { children: React.ReactNode }) {
  return <GroupHeader {...stylex.props(styles.box)} id="legacy" label={children} />;
}

const UnrelatedLocal = styled.div`
  padding: 4px;
`;

const styles = stylex.create({
  box: {
    backgroundColor: "papayawhip",
  },
});
