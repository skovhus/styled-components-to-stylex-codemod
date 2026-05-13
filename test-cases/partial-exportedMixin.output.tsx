import * as stylex from "@stylexjs/stylex";
import { css } from "styled-components";

export const exportedMixinStyles = css`
  width: 1px;
  border-radius: 0.5px;
  background-color: #94a3b8;
  pointer-events: none;
`;

export const App = () => <div sx={styles.container}>Exported mixin stays styled-components</div>;

const styles = stylex.create({
  container: {
    padding: 8,
    backgroundColor: "#f8fafc",
  },
});
