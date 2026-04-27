// Local-const + `export { ... }` style. The constant is declared without
// `export` and exported via a separate export statement at the bottom of
// the file — exercises the resolver's ability to handle bindings that
// don't trace back to an `import`.
const ITEM_PADDING_VAR = "--item-padding";
export { ITEM_PADDING_VAR };
