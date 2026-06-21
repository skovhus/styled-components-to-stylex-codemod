// Migration adapter mode: a StyleX leaf may restyle a styled-components base
// when their declared CSS properties are disjoint. Base stays as
// styled-components (its descendant selector is unsupported); Derived converts
// to StyleX because it only sets padding/font-size, which Base never sets, so
// no property conflict can cross the StyleX-over-styled-components boundary.
import styled from "styled-components";

const Base = styled.div`
  color: navy;
  background-color: lightyellow;

  & a.active {
    color: tomato;
  }
`;

const Derived = styled(Base)`
  padding: 16px;
  font-size: 18px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 12 }}>
    <Base>
      <a className="active" href="#">
        base
      </a>
    </Base>
    <Derived>derived</Derived>
  </div>
);
