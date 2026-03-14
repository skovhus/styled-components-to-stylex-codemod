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

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Child>Outside Wrapper (gray)</Child>
    <Wrapper>
      <Child>Inside Wrapper (blue, lavender)</Child>
    </Wrapper>
  </div>
);
