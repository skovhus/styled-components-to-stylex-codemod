import * as React from "react";
import styled from "styled-components";

// When a styled component is used as a base that accepts className and style,
// the wrapper should preserve these props for external styling support

export type Size = "tiny" | "small" | "normal";

export type Props = {
  color?: string;
  hollow?: boolean;
  size?: Size;
};

const StyledBadge = styled.span<Props>`
  display: inline-block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
`;

type BadgeProps = Props & {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export function ColorBadge(props: BadgeProps) {
  // className and style should be available from the styled component
  const { className, children, style } = props;

  return (
    <StyledBadge className={className} style={style}>
      {children}
    </StyledBadge>
  );
}

export const App = () => (
  <ColorBadge color="red" className="custom-class" style={{ opacity: 0.5 }}>
    Badge
  </ColorBadge>
);
