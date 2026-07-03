// Partial migration: file already has StyleX AND styled-components mixed.
// The codemod should convert the remaining styled-components into the existing
// StyleX setup so the output is fully StyleX.
//
// The file already imports `breakpoints` (used as a computed media key in the
// hand-written stylex block). A converted styled component uses `${screenSize.phone}`,
// which the adapter resolves to the SAME `breakpoints` import — the codemod must
// REUSE the existing `breakpoints` binding, not re-import it under an alias
// (`breakpointsVars`) nor rename the user's existing binding.
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { breakpoints } from "./lib/breakpoints.stylex";
import { screenSize } from "./lib/helpers";

const Container = styled.div`
  width: 100%;
  background: papayawhip;

  ${screenSize.phone} {
    width: 50%;
  }
`;

const styles = stylex.create({
  heading: {
    color: "navy",
    fontSize: { default: 24, [breakpoints.phone]: 16 },
  },
});

export const App = () => (
  <div>
    <Container>converted by codemod</Container>
    <h1 {...stylex.props(styles.heading)}>already stylex</h1>
  </div>
);
