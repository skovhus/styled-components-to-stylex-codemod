import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const Base = styled.div`
  color: navy;
  background-color: lightyellow;

  & a.active {
    color: tomato;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 12 }}>
    <Base>
      <a className="active" href="#">
        base
      </a>
    </Base>
    <Base {...stylex.props(styles.derived)}>derived</Base>
  </div>
);

const styles = stylex.create({
  derived: {
    padding: 16,
    fontSize: 18,
  },
});
