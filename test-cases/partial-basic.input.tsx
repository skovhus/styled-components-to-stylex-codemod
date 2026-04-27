// Partial-file transform: a component with an unsupported selector stays as
// styled-components while the other component in the same file converts to StyleX.
import styled from "styled-components";

const Container = styled.div`
  padding: 12px;
  background: papayawhip;
`;

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
    <Container>Converted</Container>
    <Complex>
      <a className="active" href="#">
        Preserved
      </a>
    </Complex>
  </div>
);
