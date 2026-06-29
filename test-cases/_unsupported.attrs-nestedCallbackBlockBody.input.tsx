// @expected-warning: Unsupported .attrs() callback pattern
// Like the nested-callback-binding case, but with a block-bodied callback. The block
// path must keep the nested param binding (`{ motion: { duration } }`) rather than
// treating `duration` as a module-scope constant, so the codemod still bails.
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

const Box = styled(Motion).attrs(({ motion: { duration } }: { motion: { duration: number } }) => {
  return { transition: { duration } };
})`
  color: red;
`;

export const App = () => <Box motion={{ duration: 0.3 }}>Nested block-body binding</Box>;
