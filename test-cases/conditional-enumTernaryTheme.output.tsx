// Chained ternary on enum prop with theme colors and a gradient branch
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export enum ProgressType {
  primary = "primary",
  gradient = "gradient",
  success = "success",
  warning = "warning",
  error = "error",
}

type BarProps = React.PropsWithChildren<{
  type?: ProgressType;
}>;

function Bar(props: BarProps) {
  const { children, type } = props;

  return (
    <div
      sx={[
        styles.bar,
        !(
          type === "success" ||
          type === "error" ||
          type === "warning" ||
          type === "primary" ||
          type === "gradient"
        ) && styles.barNotTypeSuccessOrTypeErrorOrTypeWarningOrTypePrimaryOrTypeGradient,
        type != null && typeVariants[type],
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Bar type={ProgressType.success}>Success</Bar>
    <Bar type={ProgressType.error}>Error</Bar>
    <Bar type={ProgressType.warning}>Warning</Bar>
    <Bar type={ProgressType.primary}>Primary</Bar>
    <Bar type={ProgressType.gradient}>Gradient</Bar>
    <Bar>Default</Bar>
  </div>
);

const styles = stylex.create({
  bar: {
    height: 40,
    paddingBlock: 8,
    paddingInline: 16,
  },
  barNotTypeSuccessOrTypeErrorOrTypeWarningOrTypePrimaryOrTypeGradient: {
    backgroundColor: $colors.labelBase,
  },
});

const typeVariants = stylex.create({
  success: {
    backgroundColor: $colors.greenBase,
  },
  error: {
    backgroundColor: $colors.bgBase,
  },
  warning: {
    backgroundColor: $colors.bgBaseHover,
  },
  primary: {
    backgroundColor: $colors.controlPrimary,
  },
  gradient: {
    backgroundImage: `linear-gradient(to right, ${$colors.bgBorderSolid}, ${$colors.labelMuted})`,
  },
});
