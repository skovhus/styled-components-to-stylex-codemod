import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { highlightStyles } from "./lib/helpers";

type ButtonProps = React.PropsWithChildren<{
  $active?: boolean;
}>;

/**
 * Interpolated pseudo with dynamic interpolation inside the pseudo block.
 * `&:${highlight}` pseudo alias wraps a prop-conditional interpolation
 * that generates entire CSS declarations.
 */
function Button(props: ButtonProps) {
  const { children, $active } = props;

  return (
    <button
      {...stylex.props(
        styles.button,
        $active &&
          highlightStyles({
            active: styles.buttonActivePseudoActive,
            hover: styles.buttonActivePseudoHover,
          }),
      )}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Button $active>Active</Button>
    <Button>Inactive</Button>
  </div>
);

const styles = stylex.create({
  button: {
    color: "blue",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  buttonActivePseudoActive: {
    backgroundColor: {
      default: null,
      ":active": "red",
    },
  },
  buttonActivePseudoHover: {
    backgroundColor: {
      default: null,
      ":hover": "red",
    },
  },
});
