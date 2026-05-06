// Type-only named React imports must not be merged into invalid default-plus-named type syntax.
import type { CSSProperties, ReactNode } from "react";
import styled from "styled-components";

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

export const ToolbarButton = styled(BaseButton)`
  padding: 4px 8px;
  color: #111827;
  background-color: #e0f2fe;
`;

export const App = () => (
  <ToolbarButton tone="accent" style={{ margin: 4 }}>
    Type-only import
  </ToolbarButton>
);
