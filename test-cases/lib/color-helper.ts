import type { DefaultTheme } from "styled-components";
import type { ColorToken } from "../tokens.stylex";

type ThemedProps = {
  theme: DefaultTheme;
};

export const color =
  (colorName: ColorToken) =>
  (props: ThemedProps): string =>
    props.theme.color[colorName];
