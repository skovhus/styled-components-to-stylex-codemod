// @expected-warning: Unsupported .attrs() object/array value on a styled component sharing a multi-declarator statement
// A styled component sharing a multi-declarator statement becomes a wrapper whose
// emission drops the sibling declarators. An object/array `.attrs` literal that
// references such a sibling cannot be represented safely, so the codemod bails.
import styled from "styled-components";
import * as React from "react";

function Motion(props: {
  className?: string;
  transition?: { duration: number };
  children?: React.ReactNode;
}) {
  return (
    <div className={props.className} data-duration={props.transition?.duration}>
      {props.children}
    </div>
  );
}

const duration = 0.2,
  Box = styled(Motion).attrs({ transition: { duration } })`
    color: green;
  `;

export const App = () => <Box>Multi-declarator attrs</Box>;
