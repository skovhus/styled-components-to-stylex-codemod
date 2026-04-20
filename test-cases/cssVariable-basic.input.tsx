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

// Adapter-resolvable var() with a default value should drop the default
// (the resolved StyleX token supersedes the runtime fallback).
const TaggedSpan = styled.span<{ $tone: string }>`
  color: var(--color-primary, "tomato");
  background: ${(props) => `var(--color-secondary, ${props.$tone})`};
`;

export const App = () => (
  <Card>
    <Text>Some text content</Text>
    <Button>Click me</Button>
    <TaggedSpan $tone="papayawhip">Tagged</TaggedSpan>
  </Card>
);
