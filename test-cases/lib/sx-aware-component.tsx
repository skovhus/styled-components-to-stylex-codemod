import * as React from "react";
import * as stylex from "@stylexjs/stylex";

/**
 * Already-migrated StyleX-aware component that accepts an `sx` prop.
 *
 * The `wrappedComponentInterface` adapter hook tells the codemod this component
 * accepts `sx`, so `styled(SxAwareButton)` emits `sx={styles.x}` instead of
 * `{...stylex.props(styles.x)}`.
 */
export function SxAwareButton(
  props: {
    sx?: React.ComponentPropsWithRef<"button">["sx"];
    className?: string;
    style?: React.CSSProperties;
    active?: boolean;
  } & React.ComponentPropsWithRef<"button">,
) {
  const { sx, className, style, active, ...rest } = props;
  const sp = stylex.props(styles.base, sx);
  return (
    <button
      {...rest}
      data-active={active ? "true" : undefined}
      className={[sp.className, className].filter(Boolean).join(" ")}
      style={{ ...sp.style, ...style }}
    />
  );
}

const styles = stylex.create({
  base: {
    display: "flex",
    backgroundColor: "#eee",
    borderWidth: 0,
    padding: 4,
  },
});
