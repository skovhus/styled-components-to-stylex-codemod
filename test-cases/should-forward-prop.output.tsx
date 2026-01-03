import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
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
  const {
    className: className,
    children: children,
    style: style,
    color: color,
    size: size,
    ...rest
  } = props;

  const sx = stylex.props(
    styles.button,
    size === "large" && styles.buttonSizeLarge,
    color && styles.buttonBackgroundColor(color),
  );

  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}

function Link(props) {
  const {
    className: className,
    children: children,
    style: style,
    isActive: isActive,
    ...rest
  } = props;

  const sx = stylex.props(styles.link, isActive && styles.linkActive);

  return (
    <a
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </a>
  );
}

function Box(props) {
  const { className: className, children: children, style: style, ...rest } = props;

  for (const k of Object.keys(rest)) {
    if (k.startsWith("$")) delete rest[k];
  }

  const sx = stylex.props(
    styles.box,
    props["$background"] && styles.boxBackgroundColor(props["$background"]),
    props["$padding"] && styles.boxPadding(props["$padding"]),
  );

  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

function Card(props) {
  const {
    className: className,
    children: children,
    style: style,
    variant: variant,
    elevation: elevation,
    rounded: rounded,
    ...rest
  } = props;

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
