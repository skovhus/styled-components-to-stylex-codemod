import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Props defined via interface (not TSTypeLiteral)
interface TransientButtonProps extends Omit<React.ComponentProps<"button">, "className" | "style"> {
  $variant?: "primary" | "secondary";
  $size?: "small" | "large";
}

// Exported component with shouldForwardProp using dropPrefix pattern
// Props are defined via interface reference, not inline type literal
// The cleanup loop should still filter unknown $-prefixed props
export function TransientButton(props: TransientButtonProps) {
  const { children, $variant, $size, ...rest } = props;

  const restRecord = rest as Record<string, unknown>;

  for (const k of Object.keys(rest)) {
    if (k.startsWith("$")) delete restRecord[k];
  }

  return (
    <button
      {...rest}
      {...stylex.props(
        styles.transientButton,
        $variant === "primary" && styles.transientButtonVariantPrimary,
        $size === "large" && styles.transientButtonSizeLarge,
      )}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <div>
    <TransientButton $variant="primary" $size="large">
      Primary Large
    </TransientButton>
  </div>
);

const styles = stylex.create({
  // Exported component with shouldForwardProp using dropPrefix pattern
  // Props are defined via interface reference, not inline type literal
  // The cleanup loop should still filter unknown $-prefixed props
  transientButton: {
    backgroundColor: "#4F74BF",
    paddingBlock: "8px",
    paddingInline: "16px",
    color: "white",
  },
  transientButtonVariantPrimary: {
    backgroundColor: "#BF4F74",
  },
  transientButtonSizeLarge: {
    paddingBlock: "12px",
    paddingInline: "24px",
  },
});
