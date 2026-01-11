import styled from "styled-components";

interface TextColorProps {
  /** The color of the text. */
  color: string;
}

/**
 * A text span that sets the color.
 * When exported, should include HTML span props (className, children, style).
 */
export const TextColor = styled("span")<TextColorProps>`
  color: ${(props) => props.color};
`;

// Usage should work with children, className, style
export const App = () => (
  <TextColor color="red" className="my-class" style={{ fontSize: 16 }}>
    Hello World
  </TextColor>
);
