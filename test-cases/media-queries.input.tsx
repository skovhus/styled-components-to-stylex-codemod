import styled from "styled-components";

const Container = styled.div`
  width: 100%;
  padding: 1rem;
  background: papayawhip;

  @media (min-width: 768px) {
    width: 750px;
    margin: 0 auto;
  }

  @media (min-width: 1024px) {
    width: 960px;
    background: mediumseagreen;
  }
`;

const Button = styled.button`
  display: block;
  margin-top: 1rem;
  padding: 12px 24px;
  background: royalblue;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  color: hotpink;
  transition: transform 0.2s ease;

  &:hover {
    @media (hover: hover) {
      transform: scale(1.1);
    }
  }

  &:active {
    transform: scale(0.9);
  }
`;

export const App = () => (
  <Container>
    <span>Responsive container</span>
    <Button>Hover me</Button>
  </Container>
);
