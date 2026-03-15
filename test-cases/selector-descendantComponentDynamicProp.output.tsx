import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ButtonProps = React.PropsWithChildren<{
  color?: string;
}>;

// Forward descendant selector with prop-based interpolation.
// The prop value is bridged to the child via a CSS custom property.
function Button(props: ButtonProps) {
  const { children, color } = props;
  const sx = stylex.props(styles.button, stylex.defaultMarker());

  return (
    <button
      {...sx}
      style={
        {
          ...sx.style,
          "--iconInButton-color": props.color ?? "red",
        } as React.CSSProperties
      }
    >
      {children}
    </button>
  );
}

type CardProps = React.PropsWithChildren<{
  shadow?: string;
}>;

function Card(props: CardProps) {
  const { children, shadow } = props;
  const sx = stylex.props(styles.card, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--badgeInCard-boxShadow": props.shadow ?? "rgba(0,0,0,0.2)",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type ToolbarProps = React.PropsWithChildren<{
  accent?: string;
}>;

function Toolbar(props: ToolbarProps) {
  const { children, accent } = props;
  const sx = stylex.props(styles.toolbar, stylex.defaultMarker());

  return (
    <div
      {...sx}
      style={
        {
          ...sx.style,
          "--tagInToolbar-border": props.accent ?? "gray",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Button color="blue">
      <span sx={[styles.icon, styles.iconInButton]} />
      Button hover → Icon color
    </Button>
    <Card shadow="rgba(0,0,255,0.3)">
      <span sx={[styles.badge, styles.badgeInCard]}>Card hover → Badge shadow</span>
    </Card>
    <Toolbar accent="red">
      <span sx={[styles.tag, styles.tagInToolbar]}>Toolbar hover → Tag border</span>
    </Toolbar>
  </div>
);

const styles = stylex.create({
  icon: {
    width: 16,
    height: 16,
  },
  button: {
    padding: 8,
  },
  // Static parts around the interpolation must be preserved in the var() reference
  // (e.g., `box-shadow: 0 4px 8px ${color}` → `"0 4px 8px var(--name)"`).
  badge: {
    fontSize: 12,
  },
  card: {
    padding: 16,
    backgroundColor: "white",
  },
  // Shorthand border with interpolation: static longhands stay static,
  // dynamic color is bridged via CSS variable.
  tag: {
    display: "inline-block",
  },
  toolbar: {
    display: "flex",
    gap: 8,
  },
  iconInButton: {
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--iconInButton-color)",
    },
  },
  badgeInCard: {
    boxShadow: {
      default: null,
      [stylex.when.ancestor(":hover")]: "0 4px 8px var(--badgeInCard-boxShadow)",
    },
  },
  tagInToolbar: {
    borderWidth: {
      default: null,
      [stylex.when.ancestor(":hover")]: 2,
    },
    borderStyle: {
      default: null,
      [stylex.when.ancestor(":hover")]: "solid",
    },
    borderColor: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--tagInToolbar-border)",
    },
  },
});
