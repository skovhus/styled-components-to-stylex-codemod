import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

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

type StyledSubmitButtonProps = { hasLabel: boolean } & Omit<
  React.ComponentPropsWithRef<typeof SubmitButton>,
  "style"
>;

// .attrs sets onlyIcon to undefined, and styled wraps with $hasLabel prop
function StyledSubmitButton(props: StyledSubmitButtonProps) {
  const { className, children, hasLabel, ...rest } = props;
  return (
    <SubmitButton
      {...rest}
      onlyIcon={undefined}
      {...mergedSx([styles.submitButton, hasLabel && styles.submitButtonHasLabel], className)}
    >
      {children}
    </SubmitButton>
  );
}

export const App = () => (
  <StyledSubmitButton onClick={() => {}} hasLabel={true}>
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
