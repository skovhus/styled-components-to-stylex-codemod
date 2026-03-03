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
 * Local styles are applied first, then external styles — so external styles
 * can override local ones, following StyleX best practices.
 *
 * @param styles - StyleX styles from stylex.create(), can be single style or array
 * @param classNames - External className or array of classNames to merge (optional)
 * @param style - External style object to merge (optional)
 * @returns Object with merged className and style props
 */
export function mergedSx(
  styles: StyleArg,
  classNames?: string | (string | undefined | false | null)[],
  style?: React.CSSProperties,
): { className?: string; style?: React.CSSProperties } {
  const sx = stylex.props(styles);
  if (!classNames && !style) {
    return sx;
  }

  let cn = sx.className;
  if (typeof classNames === "string") {
    cn = cn ? cn + " " + classNames : classNames;
  } else if (classNames) {
    for (let i = 0; i < classNames.length; i++) {
      const c = classNames[i];
      if (c) {
        cn = cn ? cn + " " + c : c;
      }
    }
  }

  return {
    className: cn,
    style: style ? (sx.style ? Object.assign({}, sx.style, style) : style) : sx.style,
  };
}
