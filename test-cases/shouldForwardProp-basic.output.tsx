import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  color?: string;
  size?: "small" | "large";
}>;

// Using shouldForwardProp to filter props (v5 pattern)
function Button(props: ButtonProps) {
  const { children, color, size, ...rest } = props;

  return (
    <button
      {...rest}
      {...stylex.props(
        styles.button,
        color != null && styles.buttonBackgroundColor(color),
        size === "large" && styles.buttonSizeLarge,
      )}
    >
      {children}
    </button>
  );
}

type LinkProps = { isActive?: boolean } & Pick<React.ComponentProps<"a">, "children" | "href">;

// Using isPropValid from @emotion
function Link(props: LinkProps) {
  const { children, isActive, ...rest } = props;

  return (
    <a {...rest} {...stylex.props(styles.link, isActive ? styles.linkActive : undefined)}>
      {children}
    </a>
  );
}

type BoxProps = React.PropsWithChildren<{
  $background?: string;
  $padding?: string;
}>;

// Custom prop filtering logic (transient props pattern)
function Box(props: BoxProps) {
  const { children, $background, $padding, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.box,
        $background != null && styles.boxBackgroundColor($background),
        $padding != null && styles.boxPadding($padding),
      )}
    >
      {children}
    </div>
  );
}

type CardProps = React.PropsWithChildren<{
  variant?: "primary" | "secondary";
  elevation?: number;
  rounded?: boolean;
}>;

// Filter multiple custom props
function Card(props: CardProps) {
  const { children, variant, elevation, rounded, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.card,
        variant === "primary" && styles.cardVariantPrimary,
        styles.cardBoxShadow(props),
        rounded ? styles.cardRounded : undefined,
      )}
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
    <div {...stylex.props(styles.colorBox, styles.colorBoxBackgroundColor("#bf4f74"))}>
      Nullish Coalescing Box
    </div>
    <Card variant="primary" elevation={3} rounded>
      Elevated Card
    </Card>
  </div>
);

const styles = stylex.create({
  button: {
    backgroundColor: "#BF4F74",
    paddingBlock: "8px",
    paddingInline: "16px",
    fontSize: "14px",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: "4px",
  },
  buttonSizeLarge: {
    paddingBlock: "12px",
    paddingInline: "24px",
    fontSize: "18px",
  },
  buttonBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
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
  // Using nullish coalescing operator for fallbacks
  colorBox: {
    backgroundColor: "#e0e0e0",
    padding: "16px",
  },
  colorBoxBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  card: {
    backgroundColor: "#4F74BF",
    borderRadius: "4px",
    padding: "16px",
    color: "white",
  },
  cardRounded: {
    borderRadius: "16px",
  },
  cardVariantPrimary: {
    backgroundColor: "#BF4F74",
  },
  cardBoxShadow: (props) => ({
    boxShadow: `0 ${(props.elevation || 1) * 2}px ${(props.elevation || 1) * 4}px rgba(0, 0, 0, 0.8)`,
  }),
});
