import * as stylex from "@stylexjs/stylex";
import { css } from "styled-components";

export const attributionStyles = css`
  --attribution-color: #bf4f74;
  color: var(--attribution-color);
`;

export const App = () => <div sx={styles.panel}>Panel</div>;

const styles = stylex.create({
  panel: {
    padding: 8,
    backgroundColor: "#eef8ff",
  },
});
