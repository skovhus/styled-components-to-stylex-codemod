import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export const App = () => (
  <div {...stylex.props(helpers.truncate, styles.elementWithImportedMixin)}>
    Red with imported mixin
  </div>
);

const styles = stylex.create({
  elementWithImportedMixin: {
    color: "red",
  },
});
