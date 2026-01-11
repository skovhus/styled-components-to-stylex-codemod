import "styled-components";

declare module "styled-components" {
  // Theme shape used across test fixtures.
  // See https://styled-components.com/docs/api#create-a-declarations-file
  export interface DefaultTheme {
    // Direct theme properties (used in theming/adhoc-theme fixtures)
    main?: string;
    secondary?: string;

    // Colors object - index signature required for dynamic lookups like
    // props.theme.colors[props.$bg] and props.theme.colors[props.variant]
    colors?: Record<string, string>;

    // Spacing object (used in function-theme fixture)
    spacing?: {
      small?: string;
      medium?: string;
      large?: string;
    };
  }
}
