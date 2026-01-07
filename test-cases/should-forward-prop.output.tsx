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

function Button(props) {
  const { color, size } = props;

  return (
    <button
      {...stylex.props(
        styles.button,
        size === "large" && styles.buttonSizeLarge,
        color && styles.buttonBackgroundColor(color),
      )}
    >
      {props.children}
    </button>
  );
}

function Link(props) {
  const { isActive } = props;

  return <a {...stylex.props(styles.link, isActive && styles.linkActive)}>{props.children}</a>;
}

function Box(props) {
  return (
    <div
      {...stylex.props(
        styles.box,
        props["$background"] && styles.boxBackgroundColor(props["$background"]),
        props["$padding"] && styles.boxPadding(props["$padding"]),
      )}
    >
      {props.children}
    </div>
  );
}

function Card(props) {
  const { variant, elevation, rounded } = props;

  return (
    <div
      {...stylex.props(
        styles.card,
        variant === "primary" && styles.cardVariantPrimary,
        rounded && styles.cardRounded,
      )}
    >
      {props.children}
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
