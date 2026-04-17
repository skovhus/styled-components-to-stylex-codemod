// @expected-warning: Partial transform would mix StyleX with styled-components across an extends chain — the base was transformed but an extending component could not be, so the extending component's CSS cannot reliably override the base
// Cascade-safety guard for partial transforms: when the non-leaf (base) could be
// converted to StyleX but the leaf (derived) carries an unsupported pattern and
// stays as styled-components, the derived's override cannot reliably beat
// StyleX's atomic classes. The whole file must bail to preserve semantics.
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
