import * as React from "react";
import * as stylex from "@stylexjs/stylex";

/**
 * Generic StyleX-aware text component. Mirrors the real-world pattern where the
 * `sx?` member lives in an intersection alongside an `Omit<…>` utility wrapper.
 *
 * The codemod auto-detects sx support by walking `TextComponentProps`'s
 * intersection and finding `sx?:` in the inline literal.
 */
type TextProps = {
  size?: "sm" | "md";
  color?: string;
};

type TextComponentProps<C extends React.ElementType> = TextProps &
  Omit<React.ComponentPropsWithRef<C>, keyof TextProps> & {
    sx?: stylex.StyleXStyles;
    as?: C;
  };

export function Text<C extends React.ElementType = "span">(props: TextComponentProps<C>) {
  const { as, sx, size, color, className, style, ...rest } = props as TextComponentProps<C> & {
    className?: string;
    style?: React.CSSProperties;
  };
  const Component = (as ?? "span") as React.ElementType;
  const sp = stylex.props(styles.base, size === "md" ? styles.md : styles.sm, sx);
  return (
    <Component
      {...rest}
      className={[sp.className, className].filter(Boolean).join(" ")}
      style={{ color, ...sp.style, ...style }}
    />
  );
}

const styles = stylex.create({
  base: { fontFamily: "system-ui, sans-serif" },
  sm: { fontSize: 12 },
  md: { fontSize: 16 },
});
