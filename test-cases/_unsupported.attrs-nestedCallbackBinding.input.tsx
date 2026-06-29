// @expected-warning: Unsupported .attrs() callback pattern
// A function-form `.attrs` callback that nests destructuring (`{ motion: { duration } }`)
// binds `duration` from the callback props. The codemod cannot recompute that object at
// build time, so it must bail rather than mistake the nested binding for a module-scope
// constant and preserve the wrong value.
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

const Box = styled(Motion).attrs(({ motion: { duration } }: { motion: { duration: number } }) => ({
  transition: { duration },
}))`
  color: red;
`;

export const App = () => <Box motion={{ duration: 0.3 }}>Nested callback binding</Box>;
