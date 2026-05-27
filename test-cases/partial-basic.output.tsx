import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

// Descendant element selectors are not representable in StyleX — this component
// must be preserved as styled-components in the output.
const Complex = styled.nav`
  color: rebeccapurple;

  & a.active {
    color: tomato;
  }
`;

export const App = () => (
  <div>
    <div sx={styles.container}>Converted</div>
    <Complex>
      <a className="active" href="#">
        Preserved
      </a>
    </Complex>
  </div>
);

const styles = stylex.create({
  container: {
    padding: 12,
    backgroundColor: "papayawhip",
  },
});
