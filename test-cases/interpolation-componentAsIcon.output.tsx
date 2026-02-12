import React from "react";
import * as stylex from "@stylexjs/stylex";

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

function StyledCollapseButton(
  props: Omit<React.ComponentPropsWithRef<typeof Button>, "className" | "style">,
) {
  return (
    <Button {...props} {...stylex.props(styles.styledCollapseButton, stylex.defaultMarker())} />
  );
}

export const App = () => (
  <StyledCollapseButton
    icon={<ArrowIcon $isOpen={true} {...stylex.props(styles.arrowIconInStyledCollapseButton)} />}
  >
    Toggle
  </StyledCollapseButton>
);

const styles = stylex.create({
  styledCollapseButton: {
    backgroundColor: "transparent",
    marginLeft: "1px",
  },
  arrowIconInStyledCollapseButton: {
    width: "18px",
    height: "auto",
    fill: "gray",
  },
});
