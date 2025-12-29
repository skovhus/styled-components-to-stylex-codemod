import "styled-components";

declare module "styled-components" {
  // Fixtures use a variety of theme shapes; keep this permissive so we can still
  // typecheck JSX/exports/imports without fighting DefaultTheme modeling.
  export interface DefaultTheme {
    [key: string]: any;
  }
}


