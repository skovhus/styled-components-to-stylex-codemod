// Prebuilt per-CSS-property mixin maps for indexed theme color lookups.
// Each entry maps a color token key to a static StyleX style for that CSS property,
// allowing `$colorMixins.backgroundColor[tokenKey]` in stylex.props() instead of
// dynamic stylex.create() style functions.
/* eslint-disable stylex/no-unused */
import * as stylex from "@stylexjs/stylex";
import { $colors } from "../tokens.stylex";

const backgroundColorStyles = stylex.create({
  main: { backgroundColor: $colors.main },
  primaryColor: { backgroundColor: $colors.primaryColor },
  secondaryColor: { backgroundColor: $colors.secondaryColor },
  labelBase: { backgroundColor: $colors.labelBase },
  labelMuted: { backgroundColor: $colors.labelMuted },
  labelTitle: { backgroundColor: $colors.labelTitle },
  greenBase: { backgroundColor: $colors.greenBase },
  bgBase: { backgroundColor: $colors.bgBase },
  bgBaseHover: { backgroundColor: $colors.bgBaseHover },
  bgBorderFaint: { backgroundColor: $colors.bgBorderFaint },
  bgBorderSolid: { backgroundColor: $colors.bgBorderSolid },
  bgFocus: { backgroundColor: $colors.bgFocus },
  bgSub: { backgroundColor: $colors.bgSub },
  bgSelected: { backgroundColor: $colors.bgSelected },
  controlPrimary: { backgroundColor: $colors.controlPrimary },
  controlPrimaryHover: { backgroundColor: $colors.controlPrimaryHover },
  textPrimary: { backgroundColor: $colors.textPrimary },
  textSecondary: { backgroundColor: $colors.textSecondary },
});

const colorStyles = stylex.create({
  main: { color: $colors.main },
  primaryColor: { color: $colors.primaryColor },
  secondaryColor: { color: $colors.secondaryColor },
  labelBase: { color: $colors.labelBase },
  labelMuted: { color: $colors.labelMuted },
  labelTitle: { color: $colors.labelTitle },
  greenBase: { color: $colors.greenBase },
  bgBase: { color: $colors.bgBase },
  bgBaseHover: { color: $colors.bgBaseHover },
  bgBorderFaint: { color: $colors.bgBorderFaint },
  bgBorderSolid: { color: $colors.bgBorderSolid },
  bgFocus: { color: $colors.bgFocus },
  bgSub: { color: $colors.bgSub },
  bgSelected: { color: $colors.bgSelected },
  controlPrimary: { color: $colors.controlPrimary },
  controlPrimaryHover: { color: $colors.controlPrimaryHover },
  textPrimary: { color: $colors.textPrimary },
  textSecondary: { color: $colors.textSecondary },
});

export const $colorMixins = {
  backgroundColor: backgroundColorStyles,
  color: colorStyles,
};
