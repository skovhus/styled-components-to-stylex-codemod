/**
 * Matches StyleX sidecar/token module sources like "./tokens.stylex" or
 * "../vars.stylex.ts". By StyleX convention these modules only export
 * `defineVars`/`defineConsts` values and plain constants — never components —
 * so they can be ignored when tracing styled-component dependencies.
 */
export function isStylexImportSource(source: string): boolean {
  return /\.stylex(?:\.[cm]?[jt]sx?)?$/u.test(source);
}
