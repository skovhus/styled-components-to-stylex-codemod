import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  multiSelector: {},
  multiSelectorHoverFocus: {
    backgroundColor: "#BF4F74",
    color: "white",
  },
  multiSelectorActiveFocusVisible: {
    outline: "2px solid #4F74BF",
    outlineOffset: "2px",
  },
  multiSelectorSelected: {
    backgroundColor: "#4F74BF",
    color: "white",
  },
  compoundSelector: {},
  compoundHighlighted: {
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "gold",
  },
  compoundError: {
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "red",
    backgroundColor: "#fee",
  },
  chainedPseudo: {},
  chainedPseudoFocusEnabled: {
    borderColor: "#BF4F74",
  },
  chainedPseudoHoverEnabled: {
    borderColor: "#999",
  },
  chainedPseudoCheckedEnabled: {
    backgroundColor: "#BF4F74",
  },
  nav: {},
  navLink: {
    color: "#333",
    textDecoration: "none",
  },
  navLinkHoverFocus: {
    color: "#BF4F74",
  },
  navLinkActive: {
    fontWeight: "bold",
    color: "#4F74BF",
  },
  heading: {
    marginBottom: "0.5em",
    lineHeight: 1.2,
  },
  textBlock: {
    marginBottom: "1em",
    lineHeight: 1.6,
  },
});

interface MultiSelectorProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  isSelected?: boolean;
}

function MultiSelector({ isActive, isSelected, ...props }: MultiSelectorProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

  return (
    <button
      {...stylex.props(
        styles.multiSelector,
        (isHovered || isFocused) && styles.multiSelectorHoverFocus,
        (isPressed || isFocused) && styles.multiSelectorActiveFocusVisible,
        (isActive || isSelected) && styles.multiSelectorSelected,
      )}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      {...props}
    />
  );
}

interface CompoundSelectorProps {
  highlighted?: boolean;
  error?: boolean;
  children?: React.ReactNode;
}

function CompoundSelector({ highlighted, error, children }: CompoundSelectorProps) {
  return (
    <div
      {...stylex.props(
        styles.compoundSelector,
        highlighted && styles.compoundHighlighted,
        error && styles.compoundError,
      )}
    >
      {children}
    </div>
  );
}

interface ChainedPseudoProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function ChainedPseudo({ disabled, ...props }: ChainedPseudoProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <input
      {...stylex.props(
        styles.chainedPseudo,
        !disabled && isFocused && styles.chainedPseudoFocusEnabled,
        !disabled && isHovered && !isFocused && styles.chainedPseudoHoverEnabled,
      )}
      disabled={disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    />
  );
}

interface NavLinkProps {
  href: string;
  isActive?: boolean;
  children?: React.ReactNode;
}

function NavLink({ href, isActive, children }: NavLinkProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <a
      href={href}
      {...stylex.props(
        styles.navLink,
        (isHovered || isFocused) && styles.navLinkHoverFocus,
        isActive && styles.navLinkActive,
      )}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </a>
  );
}

export const App = () => (
  <div>
    <MultiSelector>Multi Selector</MultiSelector>
    <CompoundSelector highlighted>Compound</CompoundSelector>
    <ChainedPseudo type="checkbox" />
    <nav {...stylex.props(styles.nav)}>
      <NavLink href="#" isActive>
        Active Link
      </NavLink>
      <NavLink href="#">Normal Link</NavLink>
    </nav>
    <div>
      <h1 {...stylex.props(styles.heading)}>Heading</h1>
      <p {...stylex.props(styles.textBlock)}>Paragraph</p>
    </div>
  </div>
);
