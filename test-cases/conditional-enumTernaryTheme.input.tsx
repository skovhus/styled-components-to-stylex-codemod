// Chained ternary on enum prop with theme colors and a gradient branch
import * as React from "react";
import styled from "styled-components";

export enum ProgressType {
  primary = "primary",
  gradient = "gradient",
  success = "success",
  warning = "warning",
  error = "error",
}

const Bar = styled.div<{ $type?: ProgressType }>`
  height: 40px;
  padding: 8px 16px;
  background: ${(props) =>
    props.$type === ProgressType.success
      ? props.theme.color.greenBase
      : props.$type === ProgressType.error
        ? props.theme.color.bgBase
        : props.$type === ProgressType.warning
          ? props.theme.color.bgBaseHover
          : props.$type === ProgressType.primary
            ? props.theme.color.controlPrimary
            : props.$type === ProgressType.gradient
              ? `linear-gradient(to right, ${props.theme.color.bgBorderSolid}, ${props.theme.color.labelMuted})`
              : props.theme.color.labelBase};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Bar $type={ProgressType.success}>Success</Bar>
    <Bar $type={ProgressType.error}>Error</Bar>
    <Bar $type={ProgressType.warning}>Warning</Bar>
    <Bar $type={ProgressType.primary}>Primary</Bar>
    <Bar $type={ProgressType.gradient}>Gradient</Bar>
    <Bar>Default</Bar>
  </div>
);
