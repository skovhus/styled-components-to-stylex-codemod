// Partial migration: file already has StyleX AND styled-components mixed.
// The codemod should convert the remaining styled-components into the existing
// StyleX setup so the output is fully StyleX.
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const Container = styled.div`
  padding: 12px;
  background: papayawhip;
`;

const styles = stylex.create({
  heading: {
    color: "navy",
    fontSize: 24,
  },
});

export const App = () => (
  <div>
    <Container>converted by codemod</Container>
    <h1 {...stylex.props(styles.heading)}>already stylex</h1>
  </div>
);
