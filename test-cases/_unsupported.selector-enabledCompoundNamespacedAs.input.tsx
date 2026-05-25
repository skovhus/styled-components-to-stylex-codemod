// @expected-warning: Unsupported selector: compound pseudo selector
// Namespaced JSX can pass as to a styled button and render it as a non-form target.
import styled from "styled-components";

const Button = styled.button`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

export const Section = { Button };

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Section.Button type="button">Button</Section.Button>
    <Section.Button as="a" href="#">
      Link
    </Section.Button>
  </div>
);
