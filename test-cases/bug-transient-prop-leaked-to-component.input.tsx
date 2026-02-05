import React from "react";
import styled from "styled-components";

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

// .attrs sets onlyIcon to undefined, and styled wraps with $hasLabel prop
const StyledSubmitButton = styled(SubmitButton).attrs({ onlyIcon: undefined })<{
  $hasLabel: boolean;
}>`
  width: ${(props) => (props.$hasLabel ? "auto" : "1.5rem")};
  overflow: hidden;
`;

export const App = () => (
  <StyledSubmitButton onClick={() => {}} $hasLabel={true}>
    Submit
  </StyledSubmitButton>
);
