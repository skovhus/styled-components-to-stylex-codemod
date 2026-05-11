import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type ImportedIconProps = {
  sx?: stylex.StyleXStyles;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
} & React.ComponentPropsWithRef<"svg">;

export interface ImportedFlexProps {
  sx?: stylex.StyleXStyles;
  className?: string;
  style?: React.CSSProperties;
}

export interface ImportedTooltipProps extends ImportedFlexProps {
  delay?: number;
  children?: React.ReactNode;
}

export type ImportedWrapperSxProps = {
  sx?: stylex.StyleXStyles;
};
