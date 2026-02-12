// @expected-warning: Unsupported selector: unknown component selector
import React from "react";
import styled from "styled-components";

// Simulates a collapse arrow icon component
function ArrowIcon(props: React.SVGProps<SVGSVGElement> & { $isOpen?: boolean }) {
  const { $isOpen, ...rest } = props;
  return (
    <svg viewBox="0 0 16 16" {...rest}>
      <path d={$isOpen ? "M4 10L8 6L12 10" : "M4 6L8 10L12 6"} />
    </svg>
  );
}

// Simulates a Button component
function Button(props: {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button onClick={props.onClick}>
      {props.icon}
      {props.children}
    </button>
  );
}

const StyledCollapseButton = styled(Button)`
  background-color: transparent;
  margin-left: 1px;

  ${ArrowIcon} {
    width: 18px;
    height: auto;
    fill: gray;
  }
`;

export const App = () => (
  <StyledCollapseButton icon={<ArrowIcon $isOpen={true} />}>Toggle</StyledCollapseButton>
);
