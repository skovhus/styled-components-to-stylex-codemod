import styled from "styled-components";

// Comma-separated pseudo-class selectors
const Button = styled.button`
  padding: 8px 16px;
  background: white;
  color: #333;
  border: 2px solid #ccc;
  border-radius: 4px;
  cursor: pointer;

  &:hover,
  &:focus {
    background: #BF4F74;
    color: white;
    border-color: #BF4F74;
  }

  &:active,
  &:focus-visible {
    outline: 2px solid #4F74BF;
    outline-offset: 2px;
  }
`;

// Three pseudo-selectors combined
const Link = styled.a`
  color: #333;
  text-decoration: none;

  &:hover,
  &:focus,
  &:active {
    color: #BF4F74;
    text-decoration: underline;
  }
`;

// Mixed with regular styles
const Input = styled.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &:hover,
  &:focus {
    border-color: #BF4F74;
  }

  &::placeholder {
    color: #999;
  }
`;

export const App = () => (
  <div>
    <Button>Hover or Focus Me</Button>
    <Link href="#">Link</Link>
    <Input placeholder="Type here..." />
  </div>
);
