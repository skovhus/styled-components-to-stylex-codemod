import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Test case for component wrappers with namespace variant dimensions
// (boolean prop overlapping with enum prop on the same CSS properties)

type BaseButtonProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}>;

function BaseButton(props: BaseButtonProps) {
  const { disabled, ...rest } = props;
  return <button disabled={disabled} {...rest} />;
}

type ButtonProps = Omit<React.ComponentPropsWithRef<typeof BaseButton>, "className" | "style"> & {
  color?: "primary" | "secondary";
  disabled?: boolean;
};

function Button(props: ButtonProps) {
  const { children, color: color = "secondary", disabled, ...rest } = props;
  return (
    <BaseButton
      disabled={disabled}
      {...rest}
      {...stylex.props(
        styles.button,
        disabled ? colorDisabledVariants[color] : colorEnabledVariants[color],
      )}
    >
      {children}
    </BaseButton>
  );
}

export function App() {
  return (
    <div>
      <Button color="primary">Primary</Button>
      <Button color="secondary">Secondary</Button>
      <Button color="primary" disabled>
        Disabled Primary
      </Button>
    </div>
  );
}

const styles = stylex.create({
  button: {
    appearance: "none",
    borderWidth: 0,
    color: "white",
  },
});

const colorEnabledVariants = stylex.create({
  primary: {
    backgroundColor: {
      default: "blue",
      ":hover": "darkblue",
    },
  },
  secondary: {
    backgroundColor: {
      default: "gray",
      ":hover": "darkgray",
    },
  },
});

const colorDisabledVariants = stylex.create({
  primary: {
    backgroundColor: {
      default: "grey",
      ":hover": "darkblue",
    },
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
  },
  secondary: {
    backgroundColor: {
      default: "grey",
      ":hover": "darkgray",
    },
    color: "rgb(204, 204, 204)",
    cursor: "not-allowed",
  },
});
