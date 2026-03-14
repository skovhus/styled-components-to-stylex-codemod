// Component used as ancestor selector without pseudo
import styled from "styled-components";

const Wrapper = styled.div`
  padding: 16px;
  background: papayawhip;
`;

const Child = styled.div`
  color: gray;
  padding: 8px;

  ${Wrapper} & {
    color: blue;
    background: lavender;
  }
`;

// Both pseudo and no-pseudo reverse on the same parent: the no-pseudo rule
// targets the same override key as the pseudo rule. The marker must be set
// on the existing override, not only when creating new ones.
const Combined = styled.div`
  color: gray;
  padding: 8px;

  ${Wrapper}:hover & {
    color: red;
  }

  ${Wrapper} & {
    background: lavender;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Child>Outside Wrapper (gray)</Child>
    <Wrapper>
      <Child>Inside Wrapper (blue, lavender)</Child>
      <Combined>Inside Wrapper (hover=red, bg=lavender)</Combined>
    </Wrapper>
  </div>
);
