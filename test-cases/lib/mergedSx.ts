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
 * @param className - External className(s) to merge (optional). Accepts a single
 *   string or an array of strings (e.g., `[bridgeClass, className]`).
 * @param style - External style object to merge (optional)
 * @returns Object with merged className and style props
 */
export function mergedSx(
  styles: StyleArg,
  className?: string | (string | undefined)[],
  style?: React.CSSProperties,
): { className?: string; style?: React.CSSProperties } {
  const sx = stylex.props(styles);
  const classNames = Array.isArray(className) ? className : [className];
  const merged = [sx.className, ...classNames].filter(Boolean).join(" ") || undefined;
  if (!merged && !style) {
    return sx;
  }
  return {
    ...sx,
    className: merged,
    style: { ...sx.style, ...style },
  };
}
