import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type FloatingButtonProps = {
  className?: string;
  style?: React.CSSProperties;
  sx?: stylex.StyleXStyles;
  primary?: boolean;
} & Omit<React.ComponentPropsWithRef<typeof SxAwareButton>, "$primary">;

export function FloatingButton(props: FloatingButtonProps) {
  const { className, children, style, sx, primary, ...rest } = props;
  const _sx = stylex.props(styles.floatingButton, primary && styles.floatingButtonPrimary, sx);

  return (
    <SxAwareButton
      {...rest}
      {..._sx}
      className={[_sx.className, className].filter(Boolean).join(" ")}
      style={{
        ..._sx.style,
        ...style,
      }}
    >
      {children}
    </SxAwareButton>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <FloatingButton>secondary</FloatingButton>
    <FloatingButton primary>primary</FloatingButton>
    <FloatingButton sx={{}}>with-sx</FloatingButton>
  </div>
);

const styles = stylex.create({
  floatingButton: {
    backgroundColor: "white",
    borderRadius: 4,
    paddingBlock: 8,
    paddingInline: 12,
  },
  floatingButtonPrimary: {
    backgroundColor: "blue",
    color: "white",
  },
});
