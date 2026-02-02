import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.localMixin, helpers.truncate, styles.localThenImported)}>
      Local then imported
    </div>
    <div {...stylex.props(helpers.truncate, styles.localMixin, styles.importedThenLocal)}>
      Imported then local
    </div>
  </div>
);

const styles = stylex.create({
  // Local mixin
  localMixin: {
    fontWeight: "bold",
  },

  // Test case 1: Local first, then imported
  // Order should be: localMixin, helpers.truncate, combined
  localThenImported: {
    color: "red",
  },

  // Test case 2: Imported first, then local
  // Order should be: helpers.truncate, localMixin, combined2
  importedThenLocal: {
    color: "blue",
  },
});
