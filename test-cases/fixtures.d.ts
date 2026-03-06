import type { TestCaseTheme } from "./tokens.stylex";

declare module "styled-components" {
  export { styled as default, styled } from "styled-components";

  // Theme shape used across test fixtures.
  // See https://styled-components.com/docs/api#create-a-declarations-file
  export interface DefaultTheme extends TestCaseTheme {}

  /** override of the default styled component props */
  export type ExecutionContext = CustomExecutionContext;
  /** override of the default styled component props */
  export type ThemedStyledProps<P = {}> = CustomExecutionContext & P;
  /** override of the default styled component props */
  export type StyledProps<P> = P & CustomExecutionContext;
  /** override the useThemeType */
  export function useTheme(): TestCaseTheme;
}

// Augment React JSX to accept the `sx` prop on intrinsic elements.
// The StyleX babel plugin (≥0.18, sxPropName option) transforms
// `<div sx={styles.base} />` to `<div {...stylex.props(styles.base)} />`
// at build time, so the prop never reaches the DOM.
import type { CompiledStyles, InlineStyles, StyleXArray } from "@stylexjs/stylex";

type StyleXSxProp = StyleXArray<
  (null | undefined | CompiledStyles) | boolean | Readonly<[CompiledStyles, InlineStyles]>
>;

declare module "react" {
  interface AriaAttributes {
    sx?: StyleXSxProp;
  }
  interface HTMLAttributes<T> {
    sx?: StyleXSxProp;
  }
}
