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

export const App = () => (
  <Button>
    <span sx={[styles.icon, styles.iconInButton]} />
    Click
  </Button>
);

const styles = stylex.create({
  icon: {
    width: 16,
    height: 16,
  },
  button: {
    padding: 8,
  },
  iconInButton: {
    color: {
      default: null,
      [stylex.when.ancestor(":hover")]: "var(--iconInButton-color)",
    },
  },
});
