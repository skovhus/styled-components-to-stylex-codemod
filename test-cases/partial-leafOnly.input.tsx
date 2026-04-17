// Partial-file transform (leaf-only): the non-leaf `Base` uses an unsupported
// descendant selector so it must stay as styled-components. The leaf `Derived`
// has only supported CSS — it can convert safely because its StyleX atomic
// classes apply on top of Base's styled-components class, preserving the
// source-order cascade.
import styled from "styled-components";

const Base = styled.div`
  color: navy;

  & a.active {
    color: tomato;
  }
`;

const Derived = styled(Base)`
  padding: 16px;
  background: lightyellow;
`;

export const App = () => (
  <div>
    <Base>
      <a className="active" href="#">
        Preserved
      </a>
    </Base>
    <Derived>Converted derived</Derived>
  </div>
);
