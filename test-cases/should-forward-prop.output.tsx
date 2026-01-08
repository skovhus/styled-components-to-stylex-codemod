import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

type ButtonProps = React.ComponentProps<"button"> & {
  color?: string;
  size?: "small" | "large";
};

function Button(props: ButtonProps) {
  const { children, className, style, color, size, ...rest } = props;

  const sx = stylex.props(
    styles.button,
    size === "large" && styles.buttonSizeLarge,
    color != null && styles.buttonBackgroundColor(color),
  );
  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

type LinkProps = React.ComponentProps<"a"> & {
  isActive?: boolean;
};

function Link(props: LinkProps) {
  const { children, className, style, isActive, ...rest } = props;

  const sx = stylex.props(styles.link, isActive && styles.linkActive);
  return (
    <a
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

type BoxProps = React.ComponentProps<"div"> & {
  $background?: string;
  $padding?: string;
};

function Box(props: BoxProps) {
  const { children, className, style, $background, $padding, ...rest } = props;

  const sx = stylex.props(
    styles.box,
    $background != null && styles.boxBackgroundColor($background),
    $padding != null && styles.boxPadding($padding),
  );
  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardProps = React.ComponentProps<"div"> & {
  variant?: "primary" | "secondary";
  elevation?: number;
  rounded?: boolean;
};

function Card(props: CardProps) {
  const { children, className, style, variant, elevation, rounded, ...rest } = props;

  const sx = stylex.props(
    styles.card,
    variant === "primary" && styles.cardVariantPrimary,
    rounded && styles.cardRounded,
  );
  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
        boxShadow: ((props) =>
          `0 ${(props.elevation || 1) * 2}px ${(props.elevation || 1) * 4}px rgba(0, 0, 0, 0.1)`)(
          props,
        ),
      }}
      {...rest}
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
