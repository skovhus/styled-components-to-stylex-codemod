// Partial migration: a styled component skipped for an unsupported universal selector
// still carries object-form `.attrs`. The skipped declaration must be left untouched —
// no hoisted attrs const should be emitted for it — while convertible siblings migrate.
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

const SkippedBox = styled(Motion).attrs({ transition: { duration: 0.2 } })`
  & > * {
    color: red;
  }
`;

const OkBox = styled.div`
  padding: 8px;
  background-color: #ddd6fe;
`;

export const App = () => (
  <div>
    <SkippedBox>Skipped</SkippedBox>
    <OkBox>Converted</OkBox>
  </div>
);
