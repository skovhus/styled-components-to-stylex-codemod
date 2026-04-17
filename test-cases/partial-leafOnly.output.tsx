import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const Base = styled.div`
  color: navy;

  & a.active {
    color: tomato;
  }
`;

export const App = () => (
  <div>
    <Base>
      <a className="active" href="#">
        Preserved
      </a>
    </Base>
    <Base {...stylex.props(styles.derived)}>Converted derived</Base>
  </div>
);

const styles = stylex.create({
  derived: {
    padding: 16,
    backgroundColor: "lightyellow",
  },
});
