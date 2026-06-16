import styled from "styled-components";

// Triple ampersand &&& is stripped and emitted in source order with a validation TODO.
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
    <Thing>Should be blue (&&& wins over && by source order)</Thing>
  </div>
);
