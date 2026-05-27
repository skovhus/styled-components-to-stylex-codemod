// Partial-file transform (non-leaf only): the non-leaf `Base` has only supported
// CSS and converts to StyleX. The leaf `Derived` has an unsupported descendant
// selector and stays as styled-components. Safe because styled-components CSS
// injects after StyleX, so the styled-components leaf's overrides still win
// against the StyleX base (the cascade intent is preserved).
import styled from "styled-components";

const Base = styled.div`
  color: navy;
  padding: 8px;
`;

const Derived = styled(Base)`
  color: tomato;

  & a.active {
    color: gold;
  }
`;

export const App = () => (
  <div>
    <Base>base</Base>
    <Derived>
      <a className="active" href="#">
        derived
      </a>
    </Derived>
  </div>
);
