import "./cssVariable-basic.css";
import styled from "styled-components";

const Button = styled.button`
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-secondary);
  border-radius: var(--border-radius);

  &:hover {
    background: var(--color-secondary);
  }
`;

const Card = styled.div`
  padding: var(--spacing-lg);
  border: 1px solid var(--color-secondary, #ccc);
  border-radius: var(--border-radius);
  margin: var(--spacing-md);
`;

// Using CSS variables with fallbacks
const Text = styled.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`;

export const App = () => (
  <Card>
    <Text>Some text content</Text>
    <Button>Click me</Button>
  </Card>
);
