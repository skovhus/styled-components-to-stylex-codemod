import React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: `.attrs({ onlyIcon: undefined })` sets a default attribute, but the codemod
// drops the attrs entirely. The `onlyIcon` default is lost in the converted output,
// changing runtime behavior for consumers that relied on the default.
function SubmitButton(props: {
  onlyIcon?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button onClick={props.onClick} className={props.className}>
      {props.children}
    </button>
  );
}

type StyledSubmitButtonProps = Omit<
  React.ComponentPropsWithRef<typeof SubmitButton>,
  "className" | "style"
> & {
  $hasLabel: boolean;
};

// .attrs sets onlyIcon to undefined, and styled wraps with $hasLabel prop
function StyledSubmitButton(props: StyledSubmitButtonProps) {
  const { children, $hasLabel, ...rest } = props;

  return (
    <SubmitButton
      onlyIcon={undefined}
      {...rest}
      {...stylex.props(styles.submitButton, $hasLabel ? styles.submitButtonHasLabel : undefined)}
    >
      {children}
    </SubmitButton>
  );
}

export const App = () => (
  <StyledSubmitButton onClick={() => {}} $hasLabel={true}>
    Submit
  </StyledSubmitButton>
);

const styles = stylex.create({
  submitButton: {
    width: "1.5rem",
    overflow: "hidden",
  },
  submitButtonHasLabel: {
    width: "auto",
  },
});
