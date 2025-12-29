import styled from 'styled-components';

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

export const App = () => <Container>Responsive container</Container>;