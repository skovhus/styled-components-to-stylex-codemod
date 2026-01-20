import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonSize = keyof typeof styles.buttonSize;

type ButtonProps = Omit<React.ComponentProps<"button">, "className" | "style"> & {
  color?: string;
  size?: ButtonSize;
};

// Using shouldForwardProp to filter props (v5 pattern)
function Button(props: ButtonProps) {
  const { children, color, size } = props;
  return (
    <button
      {...stylex.props(
        styles.button,
        size === "large" && styles.buttonSize.large,
        color != null && styles.buttonBackgroundColor(color),
      )}
    >
      {children}
    </button>
  );
}

type LinkProps = Omit<React.ComponentProps<"a">, "className" | "style"> & {
  isActive?: boolean;
};

// Using isPropValid from @emotion
function Link(props: LinkProps) {
  const { children, isActive, ...rest } = props;
  return (
    <a {...rest} {...stylex.props(styles.link, isActive && styles.linkActive)}>
      {children}
    </a>
  );
}

type BoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $background?: string;
  $padding?: string;
};

// Custom prop filtering logic (transient props pattern)
function Box(props: BoxProps) {
  const { children, $background, $padding } = props;
  return (
    <div
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

type CardVariant = keyof typeof styles.cardVariant;

type CardProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  variant?: CardVariant;
  elevation?: number;
  rounded?: boolean;
};

// Filter multiple custom props
function Card(props: CardProps) {
  const { children, variant, elevation, rounded } = props;
  return (
    <div
      {...stylex.props(
        styles.card,
        variant === "primary" && styles.cardVariant.primary,
        rounded && styles.cardRounded,
        styles.cardBoxShadow(props),
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
    <Card variant="primary" elevation={3} rounded>
      Elevated Card
    </Card>
  </div>
);

const styles = stylex.create({
  // Using shouldForwardProp to filter props (v5 pattern)
  button: {
    backgroundColor: "#BF4F74",
    paddingBlock: "8px",
    paddingInline: "16px",
    fontSize: "14px",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  buttonSize: {
    small: {},
    large: {
      paddingBlock: "12px",
      paddingInline: "24px",
      fontSize: "18px",
    },
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
  cardVariant: {
    primary: {
      backgroundColor: "#BF4F74",
    },
    secondary: {},
  },
  cardRounded: {
    borderRadius: "16px",
  },
  cardBoxShadow: (props) => ({
    boxShadow: `0 ${(props.elevation || 1) * 2}px ${(props.elevation || 1) * 4}px rgba(0, 0, 0, 0.8)`,
  }),
});
