import type { CompiledStyles, InlineStyles, StyleXArray } from "@stylexjs/stylex";
import * as stylex from "@stylexjs/stylex";

/** Single style argument that stylex.props accepts */
type StyleArg = StyleXArray<
  (null | undefined | CompiledStyles) | boolean | Readonly<[CompiledStyles, InlineStyles]>
>;

/**
 * Merges StyleX styles with an external className prop.
 *
 * This helper is useful during migration from styled-components to StyleX.
 * Transformed components that need to accept external `className` props can
 * use this function to cleanly merge StyleX-generated className with
 * externally passed ones.
 *
 * Note: External `style` props are NOT supported. StyleX manages styles internally,
 * and allowing external style props would bypass the type-safe styling system.
 * Dynamic styles should be handled via StyleX's inline style props mechanism instead.
 *
 * @example
 * ```tsx
 * function Button({ className, ...rest }: ButtonProps) {
 *   return (
 *     <button
 *       {...rest}
 *       {...mergedSx(styles.button, className)}
 *     />
 *   );
 * }
 * ```
 *
 * @param styles - StyleX styles from stylex.create(), can be single style or array
 * @param className - External className to merge (optional)
 * @returns Object with merged className and style props
 */
export function mergedSx(
  styles: StyleArg,
  className?: string,
): { className?: string; style?: React.CSSProperties } {
  const sx = stylex.props(styles);
  if (!className) {
    return sx;
  }
  return {
    ...sx,
    className: [sx.className, className].filter(Boolean).join(" ") || undefined,
  };
}
