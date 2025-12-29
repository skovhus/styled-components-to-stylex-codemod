import styled from "styled-components";

const Input = styled.input`
  padding: 8px 12px;
  border: 2px solid #ccc;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    border-color: #BF4F74;
    outline: none;
  }

  &[disabled] {
    background: #f5f5f5;
    color: #999;
    cursor: not-allowed;
  }

  &[type="checkbox"] {
    width: 20px;
    height: 20px;
    padding: 0;
  }

  &[type="radio"] {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
  }

  &[readonly] {
    background: #fafafa;
    border-style: dashed;
  }

  &::placeholder {
    color: #999;
    font-style: italic;
  }
`;

const Link = styled.a`
  color: #BF4F74;
  text-decoration: none;

  &[target="_blank"]::after {
    content: " ↗";
    font-size: 0.8em;
  }

  &[href^="https"] {
    color: #4CAF50;
  }

  &[href$=".pdf"] {
    color: #F44336;
  }
`;

export const App = () => (
  <div>
    <Input type="text" placeholder="Enter text..." />
    <Input type="text" disabled placeholder="Disabled" />
    <Input type="checkbox" />
    <Input type="radio" name="option" />
    <Input type="text" readOnly value="Read only" />
    <br />
    <Link href="/page">Internal Link</Link>
    <Link href="https://example.com" target="_blank">
      External HTTPS Link
    </Link>
    <Link href="/document.pdf">PDF Link</Link>
  </div>
);
