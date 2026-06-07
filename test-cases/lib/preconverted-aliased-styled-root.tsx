import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
// @ts-expect-error test fixture alias is resolved by the codemod test harness.
import { GroupHeader } from "@ui/styled-group-header";

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
