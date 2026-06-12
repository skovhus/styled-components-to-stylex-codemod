import styled from "styled-components";

const Button = styled.button`
  display: flex;
  color: #bf4f74;
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border: 2px solid #bf4f74;
  border-radius: 3px;
`;

const TomatoButton = styled(Button)`
  color: tomato;
  border-color: tomato;

  @media print {
    display: block;
  }
`;

// Extending a base with dynamic (prop-consuming) styles: the base must stay a
// wrapper (it strips $tint from the DOM), so the extension delegates through
// the wrapper's sx prop — its overrides merge after the base's dynamic styles
const TintedBox = styled.div<{ $tint: string }>`
  color: ${(p) => p.$tint};
  padding: 4px;
  background-color: #f0f0f0;
`;

const BigTintedBox = styled(TintedBox)`
  padding: 16px;
`;

export const App = () => (
  <div>
    <Button>Normal Button</Button>
    <TomatoButton>Tomato Button</TomatoButton>
    <TintedBox $tint="crimson">Tinted (4px padding)</TintedBox>
    <BigTintedBox $tint="seagreen">Big tinted (16px padding)</BigTintedBox>
  </div>
);
