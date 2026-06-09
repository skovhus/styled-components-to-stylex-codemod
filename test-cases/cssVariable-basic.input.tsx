import "./cssVariable-basic.css";
import * as React from "react";
import styled from "styled-components";
import { focusOutline } from "./lib/helpers";

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
  outline: 2px solid ${(props) => `var(--color-secondary)`};
`;

// Custom-property-only wrappers must remain real block elements. Replacing the
// wrapper box with display: contents changes layout even if the CSS variable
// still inherits to descendants.
const WidgetContainer = styled.div`
  --agent-item-min-width: 100%;
`;

const SingleUseWidgetContainer = styled.div`
  --agent-item-min-width: 75%;
`;

const ConditionalWidgetContainer = styled.div`
  @media (min-width: 600px) {
    --agent-item-min-width: 75%;
  }
  &:hover {
    --agent-item-min-width: 80%;
  }
`;

const VariantWidgetContainer = styled.div<{ $wide?: boolean }>`
  --agent-item-min-width: 100%;
  ${(props) => props.$wide && "--agent-item-min-width: 75%;"}
`;

const ExternalVarsWidgetContainer = styled.div`
  --agent-item-min-width: 50%;
  ${focusOutline}
`;

export const App = () => (
  <Card>
    <Text>Some text content</Text>
    <Button>Click me</Button>
    <TaggedSpan $tone="papayawhip">Tagged</TaggedSpan>
    <WidgetContainer>
      <TaggedSpan $tone="mistyrose">Wide tagged</TaggedSpan>
    </WidgetContainer>
    <WidgetContainer>
      <Button>Wide button</Button>
    </WidgetContainer>
    <SingleUseWidgetContainer>
      <Button>Single-use wide button</Button>
    </SingleUseWidgetContainer>
    <ConditionalWidgetContainer>
      <Button>Conditional wide button</Button>
    </ConditionalWidgetContainer>
    <VariantWidgetContainer $wide>
      <Button>Variant wide button</Button>
    </VariantWidgetContainer>
    <ExternalVarsWidgetContainer>
      <Button>External vars wide button</Button>
    </ExternalVarsWidgetContainer>
  </Card>
);
