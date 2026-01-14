import type { CompiledStyles, InlineStyles, StyleXArray } from "@stylexjs/stylex";
import * as stylex from "@stylexjs/stylex";

/** Single style argument that stylex.props accepts */
type StyleArg = StyleXArray<
  (null | undefined | CompiledStyles) | boolean | Readonly<[CompiledStyles, InlineStyles]>
>;

/**
 * Merges StyleX styles with external className and style props.
 *
 * This helper is useful during migration from styled-components to StyleX.
 * Transformed components that need to accept external `className` and `style`
 * props can use this function to cleanly merge StyleX-generated styles with
 * externally passed ones.
 *
 * @example
 * ```tsx
 * function Button({ className, style, ...rest }: ButtonProps) {
 *   return (
 *     <button
 *       {...rest}
 *       {...mergedSx(styles.button, className, style)}
 *     />
 *   );
 * }
 * ```
 *
 * @param styles - StyleX styles from stylex.create(), can be single style or array
 * @param className - External className to merge (optional)
 * @param style - External style object to merge (optional)
 * @returns Object with merged className and style props
 */
export function mergedSx(
  styles: StyleArg,
  className?: string,
  style?: React.CSSProperties,
): { className?: string; style?: React.CSSProperties } {
  const sx = stylex.props(styles);
  if (!className && !style) {
    return sx;
  }
  return {
    ...sx,
    className: [sx.className, className].filter(Boolean).join(" ") || undefined,
    style: { ...sx.style, ...style },
  };
}
