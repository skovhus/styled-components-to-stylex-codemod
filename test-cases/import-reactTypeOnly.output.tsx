// Type-only named React imports must not be merged into invalid default-plus-named type syntax.
import type React from "react";

import type { CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type BaseButtonProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  tone?: "neutral" | "accent";
};

function BaseButton(props: BaseButtonProps) {
  const { children, className, style, tone } = props;
  return (
    <button className={className} data-tone={tone} style={style}>
      {children}
    </button>
  );
}

export function ToolbarButton(
  props: { sx?: stylex.StyleXStyles } & Omit<
    React.ComponentPropsWithRef<typeof BaseButton>,
    "className"
  >,
) {
  const { style, sx, ...rest } = props;
  return <BaseButton {...rest} {...mergedSx([styles.toolbarButton, sx], undefined, style)} />;
}

export const App = () => (
  <ToolbarButton tone="accent" style={{ margin: 4 }}>
    Type-only import
  </ToolbarButton>
);

const styles = stylex.create({
  toolbarButton: {
    paddingBlock: 4,
    paddingInline: 8,
    color: "#111827",
    backgroundColor: "#e0f2fe",
  },
});
