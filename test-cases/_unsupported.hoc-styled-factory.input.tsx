// @expected-warning: Higher-order styled factory wrappers (e.g. hoc(styled)) are not supported
import * as React from "react";
import styled from "styled-components";

interface IconProps {
  color?: string;
  className?: string;
}

const BaseIcon = (props: IconProps) => <svg className={props.className} fill={props.color} />;

// Higher-order function that creates styled components dynamically
// This pattern cannot be converted to StyleX because:
// 1. StyleX doesn't support runtime component wrapping
// 2. The styled() call is inside a function, not a top-level declaration
const styleIcon = <P extends Pick<IconProps, "color">>(icon: React.ComponentType<P>) => styled(
  icon,
)<P>`
  fill: ${(props) => props.color ?? props.theme.color.labelMuted};
  width: 16px;
  height: auto;
  margin-right: 8px;
`;

// Another styled component that CAN be converted
const SimpleStyled = styled.div`
  padding: 8px;
`;

// Usage of the HOC factory - these all need `styled` to exist
export const StyledBaseIcon = styleIcon(BaseIcon);
export const AnotherStyledIcon = styleIcon(BaseIcon);
