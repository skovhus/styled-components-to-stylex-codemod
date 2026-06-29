// @expected-warning: Unsupported .attrs() object value
// Object-form `.attrs` whose value contains a spread (`{ ...defaults }`) cannot be hoisted
// safely. Object-form unsupported values must bail like function-form ones, rather than
// silently dropping the attr.
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

const defaults = { duration: 0.2 };

const Box = styled(Motion).attrs({ transition: { ...defaults } })`
  color: red;
`;

export const App = () => <Box>Object spread attrs</Box>;
