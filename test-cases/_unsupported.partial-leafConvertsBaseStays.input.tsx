// @expected-warning: Partial transform would have a StyleX leaf wrap a styled-components base — the extending component was transformed but its base was not, so the leaf's StyleX overrides cannot reliably beat the base's styled-components styles
// Cascade-safety guard for partial transforms:
// The base (non-leaf) has an unsupported descendant selector and stays as
// styled-components. The leaf (Derived) is simple and would convert to StyleX.
// This is the "StyleX leaf over styled-components base" direction: at runtime
// the base's styled-components CSS injects AFTER the leaf's precompiled StyleX
// atomic CSS, so the base can win property conflicts that the leaf was meant
// to override. Bail the whole file to preserve semantics.
import styled from "styled-components";

const Base = styled.div`
  color: navy;

  & a.active {
    color: tomato;
  }
`;

const Derived = styled(Base)`
  color: red;
  padding: 16px;
`;

export const App = () => (
  <div>
    <Base>
      <a className="active" href="#">
        base
      </a>
    </Base>
    <Derived>derived</Derived>
  </div>
);
