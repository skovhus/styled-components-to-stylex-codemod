import styled from "styled-components";

const Button = styled.button`
  display: inline-block;
  color: #BF4F74;
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border: 2px solid #BF4F74;
  border-radius: 3px;
`;

export const App = () => (
  <div>
    <Button>Normal Button</Button>
    <Button as="a" href="#">
      Link with Button styles
    </Button>
  </div>
);
