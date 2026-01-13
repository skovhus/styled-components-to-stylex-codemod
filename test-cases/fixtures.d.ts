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
