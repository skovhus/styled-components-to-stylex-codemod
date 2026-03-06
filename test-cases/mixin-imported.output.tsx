import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div sx={[styles.elementWithImportedMixin, helpers.truncate]}>
      This long text should be truncated with ellipsis because the mixin overrides overflow
    </div>
  </div>
);

const styles = stylex.create({
  elementWithImportedMixin: {
    color: "red",
    overflow: "visible",
    maxWidth: "150px",
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
});
