import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const ITEM_MIN_WIDTH_VAR = "--item-min-width";

function ShadowedLocalSetter() {
  const ITEM_MIN_WIDTH_VAR = "--locally-shadowed-name";

  return <div sx={styles.shadowedContainer}>Sets --locally-shadowed-name from local shadow</div>;
}

function LoopScopedSetter() {
  const ITEM_LOOP_SCOPE_VAR = "--outer-loop-name";

  for (const ITEM_LOOP_SCOPE_VAR of ["--loop-name"]) {
    if (ITEM_LOOP_SCOPE_VAR === "") {
      return null;
    }
  }

  return <div sx={styles.loopScopedContainer}>Sets --outer-loop-name after loop scope</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <div sx={styles.container}>Sets --item-min-width: 100%</div>
    <div sx={styles.consumer} style={consumerInlineStyle}>
      Reads var(--item-min-width)
    </div>
    <div sx={styles.importedSetter}>Sets --item-min-width via imported constant</div>
    <div sx={styles.barrelMinSetter}>Sets --item-min-width via barrel re-export</div>
    <div sx={styles.barrelMaxSetter}>Sets --item-max-width via barrel star re-export</div>
    <div sx={styles.directoryBarrelSetter}>Sets --item-gap via directory-style barrel</div>
    <div sx={styles.specifierExportSetter}>Sets --item-padding via local-const re-export</div>
    <ShadowedLocalSetter />
    <LoopScopedSetter />
  </div>
);

const consumerInlineStyle = {
  width: "var(--item-min-width)",
} satisfies React.CSSProperties;

const styles = stylex.create({
  container: {
    "--item-min-width": "100%",
    backgroundColor: "orange",
    color: "white",
    padding: 8,
  },
  consumer: {
    backgroundColor: "teal",
    color: "white",
    padding: 8,
  },
  // The CSS-variable name comes from another module. The codemod follows the
  // import to its `export const ... = "..."` declaration and substitutes it.
  importedSetter: {
    "--item-min-width": "50%",
    backgroundColor: "indigo",
    color: "white",
    padding: 8,
  },
  // Barrel-resolved: the codemod follows the named re-export through
  // `lib/css-vars-barrel.ts` to `lib/item-min-width.ts`.
  barrelMinSetter: {
    "--item-min-width": "75%",
    backgroundColor: "crimson",
    color: "white",
    padding: 8,
  },
  // Star-re-export-resolved: the codemod follows `export * from` through
  // `lib/css-vars-barrel.ts` to `lib/item-max-width.ts`.
  barrelMaxSetter: {
    "--item-max-width": "90%",
    backgroundColor: "darkslateblue",
    color: "white",
    padding: 8,
  },
  // Directory-barrel-resolved: imported from `./lib/css-vars` which has no
  // extension on disk and points at `lib/css-vars/index.ts`.
  directoryBarrelSetter: {
    "--item-gap": "12px",
    backgroundColor: "seagreen",
    color: "white",
    padding: 8,
  },
  // Specifier-export-resolved: imported binding's source module declares a
  // plain `const` and exports it via `export { ... };` at the bottom of the
  // file rather than the `export const ...` form.
  specifierExportSetter: {
    "--item-padding": "16px",
    backgroundColor: "chocolate",
    color: "white",
    padding: 8,
  },
  shadowedContainer: {
    "--locally-shadowed-name": "100%",
    backgroundColor: "darkorange",
    color: "white",
    padding: 8,
  },
  loopScopedContainer: {
    "--outer-loop-name": "25%",
    backgroundColor: "mediumvioletred",
    color: "white",
    padding: 8,
  },
});
