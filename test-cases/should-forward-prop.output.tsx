import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  buttonBase: {
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  buttonDefault: {
    backgroundColor: "#BF4F74",
    padding: "8px 16px",
    fontSize: "14px",
  },
  buttonLarge: {
    padding: "12px 24px",
    fontSize: "18px",
  },
  buttonColorGreen: {
    backgroundColor: "#4CAF50",
  },
  linkBase: {
    textDecoration: "none",
  },
  linkActive: {
    color: "#BF4F74",
    fontWeight: "bold",
  },
  linkInactive: {
    color: "#333",
    fontWeight: "normal",
  },
  linkHover: {
    color: "#BF4F74",
  },
  boxBase: {
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  boxDefault: {
    backgroundColor: "white",
    padding: "16px",
  },
  cardBase: {
    padding: "16px",
    color: "white",
  },
  cardPrimary: {
    backgroundColor: "#BF4F74",
  },
  cardSecondary: {
    backgroundColor: "#4F74BF",
  },
  cardRounded: {
    borderRadius: "16px",
  },
  cardSquare: {
    borderRadius: "4px",
  },
});

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string;
  size?: "small" | "large";
}

function Button({ color, size, children, ...props }: ButtonProps) {
  return (
    <button
      {...stylex.props(
        styles.buttonBase,
        styles.buttonDefault,
        size === "large" && styles.buttonLarge,
        color === "#4CAF50" && styles.buttonColorGreen,
      )}
      style={color && color !== "#4CAF50" ? { backgroundColor: color } : undefined}
      {...props}
    >
      {children}
    </button>
  );
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  isActive?: boolean;
}

function Link({ isActive, children, ...props }: LinkProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <a
      {...stylex.props(
        styles.linkBase,
        isActive ? styles.linkActive : styles.linkInactive,
        isHovered && styles.linkHover,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </a>
  );
}

interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  $background?: string;
  $padding?: string;
}

function Box({ $background, $padding, children, ...props }: BoxProps) {
  return (
    <div
      {...stylex.props(styles.boxBase, styles.boxDefault)}
      style={{
        backgroundColor: $background || undefined,
        padding: $padding || undefined,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "primary" | "secondary";
  elevation?: number;
  rounded?: boolean;
}

function Card({ variant = "primary", elevation = 1, rounded, children, ...props }: CardProps) {
  return (
    <div
      {...stylex.props(
        styles.cardBase,
        variant === "primary" ? styles.cardPrimary : styles.cardSecondary,
        rounded ? styles.cardRounded : styles.cardSquare,
      )}
      style={{
        boxShadow: `0 ${elevation * 2}px ${elevation * 4}px rgba(0, 0, 0, 0.1)`,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Button color="#4CAF50" size="large">
      Large Green Button
    </Button>
    <Button>Default Button</Button>
    <br />
    <Link href="#" isActive>
      Active Link
    </Link>
    <Link href="#">Normal Link</Link>
    <br />
    <Box $background="#f0f0f0" $padding="24px">
      Box with transient-like props
    </Box>
    <Card variant="primary" elevation={3} rounded>
      Elevated Card
    </Card>
  </div>
);
