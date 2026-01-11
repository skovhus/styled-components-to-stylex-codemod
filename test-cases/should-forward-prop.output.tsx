import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  color?: any;
  size?: any;
}> & {
  color?: string;
  size?: "small" | "large";
};

// Using shouldForwardProp to filter props (v5 pattern)
function Button(props: ButtonProps) {
  const { children, color, size } = props;

  const sx = stylex.props(
    styles.button,
    size === "large" && styles.buttonSizeLarge,
    color != null && styles.buttonBackgroundColor(color),
  );
  return <button {...sx}>{children}</button>;
}

type LinkProps = React.PropsWithChildren<{
  href?: any;
  isActive?: any;
}> & {
  isActive?: boolean;
};

// Using isPropValid from @emotion
function Link(props: LinkProps) {
  const { children, isActive, ...rest } = props;

  const sx = stylex.props(styles.link, isActive && styles.linkActive);
  return (
    <a {...rest} {...sx}>
      {children}
    </a>
  );
}

type BoxProps = React.PropsWithChildren<{
  $background?: any;
  $padding?: any;
}> & {
  $background?: string;
  $padding?: string;
};

// Custom prop filtering logic (transient props pattern)
function Box(props: BoxProps) {
  const { children, $background, $padding } = props;

  const sx = stylex.props(
    styles.box,
    $background != null && styles.boxBackgroundColor($background),
    $padding != null && styles.boxPadding($padding),
  );
  return <div {...sx}>{children}</div>;
}

type CardProps = React.PropsWithChildren<{
  elevation?: any;
  rounded?: any;
  variant?: any;
}> & {
  variant?: "primary" | "secondary";
  elevation?: number;
  rounded?: boolean;
};

// Filter multiple custom props
function Card(props: CardProps) {
  const { children, variant, elevation, rounded } = props;

  const sx = stylex.props(
    styles.card,
    variant === "primary" && styles.cardVariantPrimary,
    rounded && styles.cardRounded,
  );
  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        boxShadow: ((props) =>
          `0 ${(props.elevation || 1) * 2}px ${(props.elevation || 1) * 4}px rgba(0, 0, 0, 0.1)`)(
          props,
        ),
      }}
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

const styles = stylex.create({
  // Using shouldForwardProp to filter props (v5 pattern)
  button: {
    backgroundColor: "#BF4F74",
    padding: "8px 16px",
    fontSize: "14px",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  buttonSizeLarge: {
    padding: "12px 24px",
    fontSize: "18px",
  },
  buttonBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),

  // Using isPropValid from @emotion
  link: {
    color: {
      default: "#333",
      ":hover": "#BF4F74",
    },
    fontWeight: "normal",
    textDecoration: "none",
  },
  linkActive: {
    color: "#BF4F74",
    fontWeight: "bold",
  },

  // Custom prop filtering logic (transient props pattern)
  box: {
    backgroundColor: "white",
    padding: "16px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  boxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  boxPadding: (padding: string) => ({
    padding,
  }),

  // Filter multiple custom props
  card: {
    backgroundColor: "#4F74BF",
    borderRadius: "4px",
    padding: "16px",
    color: "white",
  },
  cardVariantPrimary: {
    backgroundColor: "#BF4F74",
  },
  cardRounded: {
    borderRadius: "16px",
  },
});
