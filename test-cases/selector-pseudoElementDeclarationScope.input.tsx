// Pseudo-element declarations must stay scoped to the pseudo-element, not the parent.
import styled from "styled-components";

const FramedCard = styled.div`
  position: relative;
  padding: 16px;
  background: white;
  border-radius: 12px;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #60a5fa, #f472b6);
    background-size: 200% 100%;
    background-position: 50% 0;
    pointer-events: none;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <FramedCard>Framed card</FramedCard>
  </div>
);
