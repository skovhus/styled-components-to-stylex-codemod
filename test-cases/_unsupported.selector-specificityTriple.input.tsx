// @expected-warning: Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX
import styled from "styled-components";

// Triple ampersand &&& and mixed tiers can change cascade precedence
// in ways that flattening to base specificity cannot preserve.
const Thing = styled.div`
  && {
    color: red;
  }

  &&& {
    color: blue;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>Should be blue (&&& wins over &&), but flattening loses that</Thing>
  </div>
);
