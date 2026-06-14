// Plain (non-StyleX) module exporting a scalar constant. Values imported from
// a plain module are not statically resolvable by the StyleX compiler, so the
// codemod must inline them (and constant-fold arithmetic on them) into
// stylex.create() rather than referencing the import.
export const COLUMN_WIDTH = 320;
