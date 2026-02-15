import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { highlightStyles } from "./lib/helpers";

type ButtonProps = React.PropsWithChildren<{
  $active?: boolean;
}>;

function Button(props: ButtonProps) {
  const { children, $active } = props;

  return (
    <button
      {...stylex.props(
        styles.button,
        $active
          ? highlightStyles({
              active: styles.buttonActivePseudoActive,
              hover: styles.buttonActivePseudoHover,
            })
          : undefined,
      )}
    >
      {children}
    </button>
  );
}

type InvertedButtonProps = React.PropsWithChildren<{
  $disabled?: boolean;
}>;

/**
 * Ternary with CSS in alternate branch: the guard must be negated.
 * `$disabled ? '' : 'background-color: green;'` → `!$disabled && ...`
 */
function InvertedButton(props: InvertedButtonProps) {
  const { children, $disabled } = props;

  return (
    <button
      {...stylex.props(
        styles.invertedButton,
        !$disabled &&
          highlightStyles({
            active: styles.invertedButtonNotDisabledPseudoActive,
            hover: styles.invertedButtonNotDisabledPseudoHover,
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
    <InvertedButton>Enabled</InvertedButton>
    <InvertedButton $disabled>Disabled</InvertedButton>
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
  invertedButton: {
    color: "blue",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  invertedButtonNotDisabledPseudoActive: {
    backgroundColor: {
      default: null,
      ":active": "green",
    },
  },
  invertedButtonNotDisabledPseudoHover: {
    backgroundColor: {
      default: null,
      ":hover": "green",
    },
  },
});
