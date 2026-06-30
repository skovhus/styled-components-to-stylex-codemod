import * as stylex from "@stylexjs/stylex";
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

export const App = () => (
  <div>
    <SkippedBox>Skipped</SkippedBox>
    <div sx={styles.okBox}>Converted</div>
  </div>
);

const styles = stylex.create({
  okBox: {
    padding: 8,
    backgroundColor: "#ddd6fe",
  },
});
