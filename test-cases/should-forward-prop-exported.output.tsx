import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type TransientButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & {
  $variant?: "primary" | "secondary";
};

// Exported component with shouldForwardProp using dropPrefix pattern
// The cleanup loop should filter unknown $-prefixed props from rest
// so external callers can't accidentally forward $unknown to the DOM
export function TransientButton(props: TransientButtonProps) {
  const { children, $variant, ...rest } = props;

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
      )}
    >
      {children}
    </button>
  );
}

type ExplicitFilterButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & {
  customProp?: string;
  anotherProp?: number;
};

// Exported component with explicit list-based shouldForwardProp
export function ExplicitFilterButton(props: ExplicitFilterButtonProps) {
  const { children, customProp, anotherProp, ...rest } = props;

  return (
    <button
      {...rest}
      {...stylex.props(
        styles.explicitFilterButton,
        customProp != null && styles.explicitFilterButtonBackgroundColor(customProp),
        styles.explicitFilterButtonPadding(props),
      )}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <div>
    <TransientButton $variant="primary">Primary</TransientButton>
    <ExplicitFilterButton customProp="#4CAF50" anotherProp={24}>
      Custom
    </ExplicitFilterButton>
  </div>
);

const styles = stylex.create({
  // Exported component with shouldForwardProp using dropPrefix pattern
  // The cleanup loop should filter unknown $-prefixed props from rest
  // so external callers can't accidentally forward $unknown to the DOM
  transientButton: {
    backgroundColor: "#4F74BF",
    color: "white",
    paddingBlock: "8px",
    paddingInline: "16px",
  },

  transientButtonVariantPrimary: {
    backgroundColor: "#BF4F74",
  },

  // Exported component with explicit list-based shouldForwardProp
  explicitFilterButton: {
    backgroundColor: "#BF4F74",
    color: "white",
  },

  explicitFilterButtonBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),

  explicitFilterButtonPadding: (props) => ({
    padding: (props.anotherProp || 16) + "px",
  }),
});
