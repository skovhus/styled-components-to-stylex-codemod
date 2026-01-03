import React from "react";
import * as stylex from "@stylexjs/stylex";
import isPropValid from "@emotion/is-prop-valid";

const styles = stylex.create({
  button: {
    padding: "8px 16px",
    fontSize: "14px",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  buttonColor: {
    backgroundColor: "#BF4F74",
  },
  buttonSize: {
    padding: "12px 24px",
    fontSize: "18px",
  },
  link: {
    color: "#333",
    fontWeight: "normal",
    textDecoration: "none",
  },
  linkActive: {
    color: "#BF4F74",
    fontWeight: "bold",
  },
  box: {
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  boxBackground: {
    backgroundColor: "white",
  },
  boxPadding: {
    padding: "16px",
  },
  card: {
    backgroundColor: "#4F74BF",
    borderRadius: "4px",
    padding: "16px",
    color: "white",
  },
  cardVariant: {
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
    $color: $color,
    $size: $size,
    ...rest
  } = props;

  const sx = stylex.props(
    styles.button,
    color === "color" && styles.buttonColor,
    size === "size" && styles.buttonSize,
    $color && styles.buttonColor,
    $size && styles.buttonSize,
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
function Box(props) {
  const {
    className: className,
    children: children,
    style: style,
    $background: $background,
    $padding: $padding,
    ...rest
  } = props;

  for (const k of Object.keys(rest)) {
    if (k.startsWith("$")) delete rest[k];
  }
  const sx = stylex.props(
    styles.box,
    background === "background" && styles.boxBackground,
    padding === "padding" && styles.boxPadding,
    $background && styles.boxBackground,
    $padding && styles.boxPadding,
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
    $variant: $variant,
    $rounded: $rounded,
    ...rest
  } = props;

  const sx = stylex.props(
    styles.card,
    variant === "variant" && styles.cardVariant,
    rounded === "rounded" && styles.cardRounded,
    $variant && styles.cardVariant,
    $rounded && styles.cardRounded,
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

export const App = () => (
  <div>
    <Button color="#4CAF50" size="large">
      Large Green Button
    </Button>
    <Button>Default Button</Button>
    <br />
    <a href="#" isActive {...stylex.props(styles.link)}>
      Active Link
    </a>
    <a href="#" {...stylex.props(styles.link)}>
      Normal Link
    </a>
    <br />
    <Box $background="#f0f0f0" $padding="24px">
      Box with transient-like props
    </Box>
    <Card variant="primary" elevation={3} rounded>
      Elevated Card
    </Card>
  </div>
);
