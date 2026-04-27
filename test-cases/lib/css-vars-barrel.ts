// Barrel file that re-exports CSS variable names from sibling modules.
// Used by the `cssVariable-interpolatedPropertyName` test case to verify the
// codemod follows re-export chains when resolving interpolated property names.
export { ITEM_MIN_WIDTH_VAR } from "./item-min-width";
export * from "./item-max-width";
