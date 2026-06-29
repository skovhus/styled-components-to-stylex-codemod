import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const defaults = { role: "button" };
const SkippedBox = styled.div.attrs({ ...defaults })`
  & > * {
    color: red;
  }
`;
export const App = () => (
  <div>
    <SkippedBox>Skipped</SkippedBox>
    <div sx={styles.okBox}>Converted</div>
  </div>
);

const styles = stylex.create({
  okBox: {
    padding: 8,
    backgroundColor: "#ddd6fe",
  },
});
