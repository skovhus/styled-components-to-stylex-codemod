import "styled-components";

declare module "styled-components" {
  // Fixtures use a variety of theme shapes; keep this permissive so we can still
  // typecheck JSX/exports/imports without fighting DefaultTheme modeling.
  export interface DefaultTheme {
    // Common theme shapes used across fixtures/examples.
    color?: any;
    colors?: any;
    [key: string]: any;
  }
}
