// A styled component that sets a CSS variable whose name is provided via a
// template interpolation (e.g. `${ITEM_MIN_WIDTH_VAR}: 100%;`). The codemod
// resolves the identifier to its top-level static string value, whether the
// binding is declared in the current file, imported from another module, or
// reached through a re-exporting barrel file.
import styled from "styled-components";
import { ITEM_MIN_WIDTH_VAR as IMPORTED_MIN_WIDTH_VAR } from "./lib/item-min-width";
// Barrel: `lib/css-vars-barrel.ts` re-exports ITEM_MIN_WIDTH_VAR via
// `export { ... } from "./item-min-width"` and ITEM_MAX_WIDTH_VAR via
// `export * from "./item-max-width"`.
import {
  ITEM_MIN_WIDTH_VAR as BARREL_MIN_WIDTH_VAR,
  ITEM_MAX_WIDTH_VAR as BARREL_MAX_WIDTH_VAR,
} from "./lib/css-vars-barrel";

const ITEM_MIN_WIDTH_VAR = "--item-min-width";

const Container = styled.div`
  ${ITEM_MIN_WIDTH_VAR}: 100%;
  background-color: orange;
  color: white;
  padding: 8px;
`;

const Consumer = styled.div`
  width: var(--item-min-width);
  background-color: teal;
  color: white;
  padding: 8px;
`;

// The CSS-variable name comes from another module. The codemod follows the
// import to its `export const ... = "..."` declaration and substitutes it.
const ImportedSetter = styled.div`
  ${IMPORTED_MIN_WIDTH_VAR}: 50%;
  background-color: indigo;
  color: white;
  padding: 8px;
`;

// Barrel-resolved: the codemod follows the named re-export through
// `lib/css-vars-barrel.ts` to `lib/item-min-width.ts`.
const BarrelMinSetter = styled.div`
  ${BARREL_MIN_WIDTH_VAR}: 75%;
  background-color: crimson;
  color: white;
  padding: 8px;
`;

// Star-re-export-resolved: the codemod follows `export * from` through
// `lib/css-vars-barrel.ts` to `lib/item-max-width.ts`.
const BarrelMaxSetter = styled.div`
  ${BARREL_MAX_WIDTH_VAR}: 90%;
  background-color: darkslateblue;
  color: white;
  padding: 8px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Container>Sets --item-min-width: 100%</Container>
    <Consumer>Reads var(--item-min-width)</Consumer>
    <ImportedSetter>Sets --item-min-width via imported constant</ImportedSetter>
    <BarrelMinSetter>Sets --item-min-width via barrel re-export</BarrelMinSetter>
    <BarrelMaxSetter>Sets --item-max-width via barrel star re-export</BarrelMaxSetter>
  </div>
);
