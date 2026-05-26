// @expected-warning: Unsupported selector: compound pseudo selector
// Identifier-backed namespace objects can pass as to a styled button and render it as a non-form target.
import styled from "styled-components";

const Button = styled.button`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

const Controls = { Button };
const Section = { Controls };

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Button type="button">Button</Button>
    <Section.Controls.Button as="a" href="#">
      Link
    </Section.Controls.Button>
  </div>
);
