import styled from 'styled-components';

const Button = styled.button`
  display: inline-block;
  padding: 8px 16px;
  background: #BF4F74;
  color: white;
  border: none;
  border-radius: 4px;
  text-decoration: none;
  cursor: pointer;
`;

// Wrapper that always renders as a specific element but passes `as` through
const ButtonWrapper = styled(Button)`
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
`;

export const App = () => (
  <div>
    <Button>Regular Button</Button>
    <Button as="a" href="#">Button as Link</Button>
    <ButtonWrapper forwardedAs="a" href="#">Wrapper forwards as Link</ButtonWrapper>
  </div>
);
